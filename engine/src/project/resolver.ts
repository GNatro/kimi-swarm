/**
 * Project Resolver — Detect current project from cwd/env/registry
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { basename } from 'path';
import { loadRegistry, getProject } from './registry.js';
import type { ProjectConfig } from './types.js';

export function resolveProjectId(options?: { cwd?: string; env?: string }): string {
  // 1. Explicit env variable
  const envId = options?.env || process.env.SWARM_PROJECT_ID;
  if (envId) return envId;

  // 2. Detect from cwd → git root → basename
  const cwd = options?.cwd || process.cwd();
  let gitRoot: string | null = null;
  try {
    gitRoot = execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf-8', timeout: 5000 }).trim();
  } catch {
    gitRoot = null;
  }

  const projectName = gitRoot ? basename(gitRoot) : basename(cwd);

  // 3. Search registry by root or name
  const registry = loadRegistry();
  for (const [id, proj] of Object.entries(registry.projects)) {
    if (proj.root === gitRoot || proj.name === projectName || id === projectName) {
      return id;
    }
  }

  // 4. Fail-open: return "general"
  return 'general';
}

export function resolveProjectConfig(options?: { cwd?: string; env?: string }): ProjectConfig {
  const projectId = resolveProjectId(options);
  const proj = getProject(projectId);
  if (proj) return proj;

  // Default config for "general"
  return {
    name: 'general',
    root: process.cwd(),
    busRoot: `/home/grapho/shared-context/general`,
    language: 'generic',
    status: 'active',
  };
}

export function resolveProjectFromCwd(cwd: string): { projectId: string; projectRoot: string } {
  const projectId = resolveProjectId({ cwd });
  const proj = getProject(projectId);
  return {
    projectId,
    projectRoot: proj?.root || cwd,
  };
}
