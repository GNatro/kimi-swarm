/**
 * Swarm Lock Manager
 * Coordinates multiple agents working on the same repo without file conflicts.
 * Project-agnostic lock coordination.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync, statSync } from 'fs';
import { join, resolve, normalize, isAbsolute } from 'path';
import os from 'os';
import type { FileLock, LockConflict, LockAcquireResult } from './types.js';
import { DEFAULT_CONFIG } from '../types/index.js';
import { getProject } from '../project/registry.js';
import { recordEvent, recordCounter } from '../telemetry/collector.js';

const HOME = process.env.HOME || os.homedir() || '/tmp';
const DEFAULT_TTL_MINUTES = 60;
const MAX_FILES_PER_LOCK = 20;

function resolveLockDir(projectId: string): { lockDir: string; archiveDir: string; projectRoot: string } {
  const projectConfig = getProject(projectId);
  const busRoot = projectConfig?.busRoot ?? DEFAULT_CONFIG.busRoot;
  const projectRoot = projectConfig?.root ?? DEFAULT_CONFIG.projectRoot;
  const lockDir = join(busRoot, 'bus', 'locks');
  const archiveDir = join(lockDir, 'archive');
  return { lockDir, archiveDir, projectRoot };
}

function nowIso(): string {
  return new Date().toISOString();
}

function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function ensureDirs(lockDir: string, archiveDir: string) {
  mkdirSync(lockDir, { recursive: true });
  mkdirSync(archiveDir, { recursive: true });
}

function listLockFiles(lockDir: string): string[] {
  ensureDirs(lockDir, join(lockDir, 'archive'));
  try {
    return readdirSync(lockDir)
      .filter(f => f.endsWith('.json') && !f.startsWith('.'))
      .map(f => join(lockDir, f));
  } catch {
    return [];
  }
}

function readLockFile(path: string): FileLock | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as FileLock;
  } catch {
    return null;
  }
}

function isExpired(lock: FileLock): boolean {
  return new Date(lock.expires_at).getTime() < Date.now();
}

function normalizePaths(files: string[], projectRoot: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const f of files) {
    const n = normalize(f);
    // Reject absolute paths and paths escaping project root
    if (isAbsolute(n)) {
      invalid.push(f);
      continue;
    }
    const resolved = resolve(projectRoot, n);
    const rel = resolved.replace(resolve(projectRoot) + '/', '').replace(resolve(projectRoot) + '\\', '');
    if (rel.startsWith('..') || isAbsolute(rel)) {
      invalid.push(f);
      continue;
    }
    valid.push(rel);
  }
  return { valid, invalid };
}

export function cleanupExpiredLocks(projectId: string): number {
  const { lockDir, archiveDir } = resolveLockDir(projectId);
  ensureDirs(lockDir, archiveDir);
  let cleaned = 0;
  for (const file of listLockFiles(lockDir)) {
    const lock = readLockFile(file);
    if (!lock) continue;
    if (isExpired(lock)) {
      const base = file.split('/').pop() || '';
      const archivePath = join(archiveDir, base);
      try {
        renameSync(file, archivePath);
        cleaned++;
        recordEvent('lock_expired', { project: projectId, lock_id: lock.lock_id });
        recordCounter('locks_expired', 1, projectId);
      } catch {
        // ignore race
      }
    }
  }
  return cleaned;
}

export function listActiveLocks(projectId: string): FileLock[] {
  const { lockDir } = resolveLockDir(projectId);
  cleanupExpiredLocks(projectId);
  return listLockFiles(lockDir)
    .map(readLockFile)
    .filter((l): l is FileLock => l !== null && !isExpired(l));
}

export function checkConflicts(
  files: string[],
  options: { projectId: string; projectRoot?: string }
): LockConflict[] {
  const { projectRoot: resolvedRoot } = resolveLockDir(options.projectId);
  const projectRoot = options.projectRoot ?? resolvedRoot;
  const { valid } = normalizePaths(files, projectRoot);
  const active = listActiveLocks(options.projectId);
  const conflicts: LockConflict[] = [];
  for (const lock of active) {
    for (const lockedFile of lock.files_locked) {
      for (const f of valid) {
        if (f === lockedFile || f.startsWith(lockedFile + '/') || lockedFile.startsWith(f + '/')) {
          const severity = isExpired(lock) ? 'warning' : 'blocking';
          conflicts.push({ file: f, existingLock: lock, severity });
        }
      }
    }
  }
  return conflicts;
}

export function acquireLock(
  agentId: string,
  files: string[],
  options: {
    taskDescription: string;
    projectId: string;
    agentRole?: string;
    ttlMinutes?: number;
    soulId?: string;
    projectRoot?: string;
  }
): LockAcquireResult {
  const { lockDir, archiveDir, projectRoot: resolvedRoot } = resolveLockDir(options.projectId);
  const projectRoot = options.projectRoot ?? resolvedRoot;
  ensureDirs(lockDir, archiveDir);

  if (files.length > MAX_FILES_PER_LOCK) {
    return {
      success: false,
      conflicts: [],
      message: `Too many files: ${files.length} (max ${MAX_FILES_PER_LOCK})`,
    };
  }

  const { valid, invalid } = normalizePaths(files, projectRoot);
  if (invalid.length > 0) {
    return {
      success: false,
      conflicts: [],
      message: `Invalid paths: ${invalid.join(', ')}`,
    };
  }

  cleanupExpiredLocks(options.projectId);

  // Check conflicts with OTHER agents
  const active = listActiveLocks(options.projectId);
  const conflicts: LockConflict[] = [];
  for (const lock of active) {
    if (lock.agent_id === agentId) continue; // Same agent can re-acquire
    for (const lockedFile of lock.files_locked) {
      for (const f of valid) {
        if (f === lockedFile || f.startsWith(lockedFile + '/') || lockedFile.startsWith(f + '/')) {
          conflicts.push({ file: f, existingLock: lock, severity: 'blocking' });
        }
      }
    }
  }

  if (conflicts.length > 0) {
    return {
      success: false,
      conflicts,
      message: `Conflicts detected on ${conflicts.length} file(s)`,
    };
  }

  const lockId = `lock-${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}-${agentId}`;
  const lock: FileLock = {
    lock_id: lockId,
    agent_id: agentId,
    agent_role: options.agentRole || 'unknown',
    acquired_at: nowIso(),
    expires_at: minutesFromNow(options.ttlMinutes ?? DEFAULT_TTL_MINUTES),
    files_locked: valid,
    task_description: options.taskDescription || '',
    soul_id: options.soulId,
  };

  const lockPath = join(lockDir, `${lockId}.json`);
  const tmp = `${lockPath}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(lock, null, 2), 'utf-8');
  renameSync(tmp, lockPath);

  recordEvent('lock_acquired', {
    project: options.projectId,
    agent: agentId,
    lock_id: lockId,
    files: valid.length,
  });
  recordCounter('locks_acquired', 1, options.projectId);

  return {
    success: true,
    lockId,
    conflicts: [],
    message: `Lock acquired for ${valid.length} file(s)`,
  };
}

export function releaseLock(lockId: string, projectId: string): boolean {
  const { lockDir, archiveDir } = resolveLockDir(projectId);
  const lockPath = join(lockDir, `${lockId}.json`);
  if (!existsSync(lockPath)) return false;
  const archivePath = join(archiveDir, `${lockId}.json`);
  try {
    renameSync(lockPath, archivePath);
    recordEvent('lock_released', { project: projectId, lock_id: lockId });
    recordCounter('locks_released', 1, projectId);
    return true;
  } catch {
    return false;
  }
}

export function extendLock(lockId: string, additionalMinutes: number, agentId: string, projectId: string): boolean {
  const { lockDir } = resolveLockDir(projectId);
  const lockPath = join(lockDir, `${lockId}.json`);
  if (!existsSync(lockPath)) return false;
  const lock = readLockFile(lockPath);
  if (!lock) return false;
  if (lock.agent_id !== agentId) return false;

  lock.expires_at = minutesFromNow(
    Math.ceil((new Date(lock.expires_at).getTime() - Date.now()) / 60000) + additionalMinutes
  );

  const tmp = `${lockPath}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(lock, null, 2), 'utf-8');
  renameSync(tmp, lockPath);
  return true;
}
