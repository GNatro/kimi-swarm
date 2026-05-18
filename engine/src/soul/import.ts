/**
 * Soul Import
 * Hydrates session context from a transferable soul artifact.
 * Project-agnostic soul import.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import {
  type SoulManifest,
  type SoulRegistry,
  type SoulPreview,
  type SoulImportOptions,
  type SoulImportResult,
} from './types.js';
import { DEFAULT_CONFIG } from '../types/index.js';
import { getProject } from '../project/registry.js';
import { recordEvent, recordCounter } from '../telemetry/collector.js';

const HOME = process.env.HOME || '/home/grapho';
const SESSION_DIR = join(HOME, '.kimi/memory/sessions/active');

function readJsonSafe<T>(path: string, fallback: T): T {
  try {
    const data = readFileSync(path, 'utf-8');
    return JSON.parse(data) as T;
  } catch {
    return fallback;
  }
}

function readFileSafe(path: string, fallback = ''): string {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return fallback;
  }
}

function resolvePaths(options: SoulImportOptions): {
  projectRoot: string;
  soulsDir: string;
  projectId: string;
} {
  const projectConfig = getProject(options.projectId);
  const projectRoot = projectConfig?.root ?? DEFAULT_CONFIG.projectRoot;
  const busRoot = projectConfig?.busRoot ?? DEFAULT_CONFIG.busRoot;
  const soulsDir = join(busRoot, 'souls');
  return { projectRoot, soulsDir, projectId: options.projectId };
}

function currentGitBranch(projectRoot: string): string {
  try {
    return execSync(`git -C "${projectRoot}" branch --show-current`, { encoding: 'utf-8', timeout: 5000 }).trim();
  } catch {
    return 'unknown';
  }
}

function localGitStatus(projectRoot: string): string[] {
  try {
    const out = execSync(`git -C "${projectRoot}" status --short`, { encoding: 'utf-8', timeout: 5000 });
    return out.split('\n').filter(l => l.trim().length > 0).map(l => l.slice(3).trim());
  } catch {
    return [];
  }
}

function readRegistry(soulsDir: string, projectId: string): SoulRegistry {
  const registryPath = join(soulsDir, 'registry.json');
  return readJsonSafe<SoulRegistry>(registryPath, { version: '1.0', project: projectId, souls: [] });
}

function writeRegistry(soulsDir: string, registry: SoulRegistry) {
  const registryPath = join(soulsDir, 'registry.json');
  const tmp = `${registryPath}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(registry, null, 2), 'utf-8');
  try {
    renameSync(tmp, registryPath);
  } catch {
    writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
  }
}

export async function findPendingSouls(projectId: string): Promise<SoulManifest[]> {
  const projectConfig = getProject(projectId);
  const busRoot = projectConfig?.busRoot ?? DEFAULT_CONFIG.busRoot;
  const soulsDir = join(busRoot, 'souls');

  const registry = readRegistry(soulsDir, projectId);
  return registry.souls
    .filter(s => s.status === 'active')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(s => {
      if (!s.soulPath) return null as unknown as SoulManifest;
      const manifestPath = join(s.soulPath, 'soul-manifest.json');
      return readJsonSafe<SoulManifest>(manifestPath, null as unknown as SoulManifest);
    })
    .filter((m): m is SoulManifest => m !== null);
}

export async function previewSoul(soulId: string, projectId: string): Promise<SoulPreview> {
  const projectConfig = getProject(projectId);
  const busRoot = projectConfig?.busRoot ?? DEFAULT_CONFIG.busRoot;
  const soulsDir = join(busRoot, 'souls');

  const soulPath = join(soulsDir, soulId);
  const manifest = readJsonSafe<SoulManifest>(join(soulPath, 'soul-manifest.json'), null as unknown as SoulManifest);
  if (!manifest) {
    throw new Error(`Soul not found: ${soulId}`);
  }
  const resume = readFileSafe(join(soulPath, 'soul-resume.md'));
  const lastCompleted = resume.split('\n').find(l => l.startsWith('## Current State')) || '';
  return {
    soulId: manifest.soul_id,
    agentRole: manifest.agent_role,
    createdAt: manifest.created_at,
    activeTask: manifest.next_steps[0] || 'unknown',
    lastCompleted,
    nextSteps: manifest.next_steps,
    filesModified: manifest.files_touched,
    estimatedTokens: manifest.estimated_tokens,
  };
}

export async function importSoul(soulId: string, options: SoulImportOptions): Promise<SoulImportResult> {
  const { projectRoot, soulsDir } = resolvePaths(options);

  const soulPath = join(soulsDir, soulId);
  if (!existsSync(soulPath)) {
    return {
      soulId,
      status: 'failed',
      hydratedPath: '',
      filesToReview: [],
      nextSteps: [],
      warnings: [`Soul directory not found: ${soulPath}`],
      estimatedContextTokens: 0,
    };
  }

  const manifest = readJsonSafe<SoulManifest>(join(soulPath, 'soul-manifest.json'), null as unknown as SoulManifest);
  if (!manifest) {
    return {
      soulId,
      status: 'failed',
      hydratedPath: '',
      filesToReview: [],
      nextSteps: [],
      warnings: ['soul-manifest.json missing or invalid'],
      estimatedContextTokens: 0,
    };
  }

  const registry = readRegistry(soulsDir, options.projectId);
  const registryEntry = registry.souls.find(s => s.soulId === soulId);
  if (registryEntry?.status === 'consumed') {
    return {
      soulId,
      status: 'failed',
      hydratedPath: '',
      filesToReview: [],
      nextSteps: [],
      warnings: [`Soul ${soulId} has already been consumed by ${registryEntry.consumedBy || 'unknown'}`],
      estimatedContextTokens: 0,
    };
  }

  const warnings: string[] = [];

  // Branch mismatch warning
  const currentBranch = currentGitBranch(projectRoot);
  if (manifest.git_branch !== 'unknown' && manifest.git_branch !== currentBranch) {
    warnings.push(`Branch mismatch: soul was on '${manifest.git_branch}', current is '${currentBranch}'`);
  }

  // Local conflict warning
  const localModified = localGitStatus(projectRoot);
  const overlap = manifest.files_touched
    .map(f => f.path)
    .filter(p => localModified.some(l => l.includes(p) || p.includes(l)));
  if (overlap.length > 0) {
    warnings.push(`Local files overlap with soul: ${overlap.join(', ')}`);
  }

  // Hydrate
  const hydrateDir = join(SESSION_DIR, `soul-import-${soulId}`);
  mkdirSync(hydrateDir, { recursive: true });

  const diff = readFileSafe(join(soulPath, 'soul-diff.patch'));

  const hydratedContext = `# Soul Import — ${soulId}
## Source: ${manifest.agent_id} (${manifest.agent_role}) @ ${manifest.created_at}
## Active Task: ${manifest.next_steps[0] || 'unknown'}
## What Was Done: ${manifest.git_commit_message}
## Current State: Build ${manifest.build_status}, Tests ${manifest.tests_run}, Risk ${manifest.risk_score}
## Files Modified:
${manifest.files_touched.map(f => `- ${f.path} (${f.action}, ${f.lines_changed} lines)`).join('\n')}
## Next Steps:
${manifest.next_steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}
## Warnings:
${warnings.length > 0 ? warnings.map(w => `- ${w}`).join('\n') : '- None'}
## How to Resume: 1) Review diff, 2) Apply, 3) Run tests, 4) Continue
`;

  const resume = readFileSafe(join(soulPath, 'soul-resume.md'));
  const hydratedResume = `# Hydrated Resume — ${soulId}
${resume}

## Import Metadata
- Imported By: ${options.agentId} (${options.agentRole})
- Imported At: ${new Date().toISOString()}
- Status: ${warnings.length > 0 ? 'CONFLICT_WARNINGS' : 'CLEAN'}
`;

  const hydratedTodo = `# Hydrated TODO — ${soulId}
${manifest.next_steps.map((s, i) => `- [ ] ${i + 1}. ${s}`).join('\n')}
`;

  const applyOrder = manifest.files_touched.map(f => f.path);
  const diffReview = `# Diff Review — ${soulId}
## Files Modified
${applyOrder.map((p, i) => `${i + 1}. ${p}`).join('\n')}

## Apply Order (recommended)
1. Review each file
2. Apply soul-diff.patch manually or via: git apply ${join(soulPath, 'soul-diff.patch')}
3. Run tests

${warnings.length > 0 ? `## WARNINGS\n${warnings.map(w => `- ${w}`).join('\n')}` : ''}
`;

  writeFileSync(join(hydrateDir, 'hydrated-context.md'), hydratedContext, 'utf-8');
  writeFileSync(join(hydrateDir, 'hydrated-resume.md'), hydratedResume, 'utf-8');
  writeFileSync(join(hydrateDir, 'hydrated-todo.md'), hydratedTodo, 'utf-8');
  const diffReviewPath = join(hydrateDir, 'diff-review.md');
  writeFileSync(diffReviewPath, diffReview, 'utf-8');

  // Update registry
  if (registryEntry) {
    registryEntry.status = 'consumed';
    registryEntry.consumedAt = new Date().toISOString();
    registryEntry.consumedBy = options.agentId;
  }
  writeRegistry(soulsDir, registry);

  const status: 'hydrated' | 'conflict' = warnings.length > 0 ? 'conflict' : 'hydrated';

  recordEvent('soul_imported', {
    project: options.projectId,
    agent: options.agentId,
    soul_id: soulId,
    status,
  });
  recordCounter('souls_imported', 1, options.projectId);

  return {
    soulId,
    status,
    hydratedPath: hydrateDir,
    diffReviewPath,
    filesToReview: applyOrder,
    nextSteps: manifest.next_steps,
    warnings,
    estimatedContextTokens: manifest.estimated_tokens,
  };
}
