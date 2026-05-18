/**
 * Project Registry — Load/save swarm-projects.json
 */

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import type { ProjectConfig, ProjectRegistry } from './types.js';

const REGISTRY_PATH = join(process.env.HOME || '/home/grapho', '.kimi/swarm-projects.json');
const REGISTRY_BACKUP = `${REGISTRY_PATH}.backup`;

function readJsonSafe<T>(path: string, fallback: T): T {
  try {
    const data = readFileSync(path, 'utf-8');
    return JSON.parse(data) as T;
  } catch {
    return fallback;
  }
}

function atomicWrite(filePath: string, content: string) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}`;
  writeFileSync(tmp, content, 'utf-8');
  renameSync(tmp, filePath);
}

export function loadRegistry(): ProjectRegistry {
  if (existsSync(REGISTRY_PATH)) {
    const data = readJsonSafe<ProjectRegistry>(REGISTRY_PATH, null as unknown as ProjectRegistry);
    if (data && data.projects !== undefined) return data;
  }
  // Try backup
  if (existsSync(REGISTRY_BACKUP)) {
    const backup = readJsonSafe<ProjectRegistry>(REGISTRY_BACKUP, null as unknown as ProjectRegistry);
    if (backup && backup.projects !== undefined) return backup;
  }
  // Create empty
  const empty: ProjectRegistry = { version: '1.0', projects: {} };
  saveRegistry(empty);
  return empty;
}

export function saveRegistry(registry: ProjectRegistry) {
  // Backup existing
  if (existsSync(REGISTRY_PATH)) {
    try {
      renameSync(REGISTRY_PATH, REGISTRY_BACKUP);
    } catch {
      // ignore
    }
  }
  registry.lastUpdated = new Date().toISOString();
  atomicWrite(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

export function getProject(id: string): ProjectConfig | null {
  const registry = loadRegistry();
  return registry.projects[id] || null;
}

export function registerProject(config: ProjectConfig): void {
  const registry = loadRegistry();
  const errors = validateProjectConfig(config);
  if (errors.length > 0) {
    throw new Error(`Invalid project config: ${errors.join('; ')}`);
  }
  registry.projects[config.name] = {
    ...config,
    status: config.status || 'active',
    registeredAt: config.registeredAt || new Date().toISOString(),
  };
  saveRegistry(registry);
}

export function validateProjectConfig(config: ProjectConfig): string[] {
  const errors: string[] = [];
  if (!config.name || config.name.length < 2) errors.push('name must be >= 2 chars');
  if (!config.root || !existsSync(config.root)) errors.push('root must exist');
  if (!config.busRoot) errors.push('busRoot is required');
  if (!config.language) errors.push('language is required');
  return errors;
}

export function rebuildRegistry(projectId: string): void {
  const registry = loadRegistry();
  const proj = registry.projects[projectId];
  if (proj && existsSync(proj.root)) {
    // Re-detect language/framework/patterns
    // (placeholder — detector.ts handles this)
    proj.mapIndexedAt = null;
  }
  saveRegistry(registry);
}

export function rebuildAllRegistry(): void {
  const registry = loadRegistry();
  for (const [id, proj] of Object.entries(registry.projects)) {
    if (!existsSync(proj.root)) {
      proj.status = 'inactive';
    }
  }
  saveRegistry(registry);
}
