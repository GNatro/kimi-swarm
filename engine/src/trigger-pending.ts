/**
 * Pending Orchestration State — Stores plans awaiting approval
 * File: ~/.kimi/state/orchestration-pending.json
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface PendingState {
  taskId: string;
  request: string;
  projectId: string;
  partitionJson: string;
  briefJson: string;
  status: 'pending' | 'approved' | 'rejected';
  scope?: string;
  createdAt: string;
  approvedAt?: string;
}

const PENDING_FILE = join(homedir(), '.kimi', 'state', 'orchestration-pending.json');

function ensureDir() {
  const dir = join(homedir(), '.kimi', 'state');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function savePending(state: PendingState): void {
  ensureDir();
  writeFileSync(PENDING_FILE, JSON.stringify(state, null, 2));
}

export function loadPending(): PendingState | null {
  if (!existsSync(PENDING_FILE)) return null;
  try {
    const data = readFileSync(PENDING_FILE, 'utf-8');
    return JSON.parse(data) as PendingState;
  } catch {
    return null;
  }
}

export function clearPending(): void {
  if (existsSync(PENDING_FILE)) {
    writeFileSync(PENDING_FILE, JSON.stringify({ status: 'rejected', clearedAt: new Date().toISOString() }));
  }
}

export function markApproved(scope?: string): PendingState | null {
  const pending = loadPending();
  if (!pending) return null;
  if (pending.status !== 'pending') return null;
  
  pending.status = 'approved';
  pending.scope = scope;
  pending.approvedAt = new Date().toISOString();
  savePending(pending);
  return pending;
}

export function isStale(pending: PendingState, maxMinutes: number = 30): boolean {
  const created = new Date(pending.createdAt).getTime();
  const now = Date.now();
  return (now - created) > maxMinutes * 60 * 1000;
}
