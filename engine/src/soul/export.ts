/**
 * Soul Export
 * Packages session context into a transferable artifact.
 * Project-agnostic soul export.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import {
  type SoulExportOptions,
  type SoulExportResult,
  type SoulManifest,
  type SoulRegistry,
  type SoulFileTouch,
} from './types.js';
import { DEFAULT_CONFIG } from '../types/index.js';
import { getProject } from '../project/registry.js';
import { recordEvent, recordCounter } from '../telemetry/collector.js';

const HOME = process.env.HOME || '/home/grapho';
const SESSION_DIR = join(HOME, '.kimi/memory/sessions/active');
const MAX_FILE_SIZE = 10 * 1024; // 10KB

function nowIso(): string {
  return new Date().toISOString();
}

function resolvePaths(options: SoulExportOptions): {
  projectRoot: string;
  busRoot: string;
  soulsDir: string;
  projectId: string;
} {
  const projectConfig = getProject(options.projectId);
  const projectRoot = projectConfig?.root ?? DEFAULT_CONFIG.projectRoot;
  const busRoot = projectConfig?.busRoot ?? DEFAULT_CONFIG.busRoot;
  const soulsDir = join(busRoot, 'souls');
  return { projectRoot, busRoot, soulsDir, projectId: options.projectId };
}

function gitShortSha(projectRoot: string): string {
  try {
    return execSync(`git -C "${projectRoot}" rev-parse --short HEAD`, { encoding: 'utf-8', timeout: 5000 }).trim();
  } catch {
    return 'unknown';
  }
}

function gitBranch(projectRoot: string): string {
  try {
    return execSync(`git -C "${projectRoot}" branch --show-current`, { encoding: 'utf-8', timeout: 5000 }).trim();
  } catch {
    return 'unknown';
  }
}

function gitCommitMessage(projectRoot: string): string {
  try {
    return execSync(`git -C "${projectRoot}" log -1 --pretty=%B`, { encoding: 'utf-8', timeout: 5000 }).trim().split('\n')[0];
  } catch {
    return 'unknown';
  }
}

function gitDiff(projectRoot: string): string {
  try {
    return execSync(`git -C "${projectRoot}" diff HEAD`, { encoding: 'utf-8', timeout: 10000 });
  } catch {
    return '';
  }
}

function gitStat(projectRoot: string): SoulFileTouch[] {
  try {
    const out = execSync(`git -C "${projectRoot}" diff --stat HEAD`, { encoding: 'utf-8', timeout: 5000 });
    const lines = out.split('\n').filter(l => l.includes('|'));
    return lines.map(line => {
      const parts = line.split('|');
      const path = parts[0].trim();
      const changePart = parts[1]?.trim() || '';
      const linesChanged = parseInt(changePart.replace(/\D/g, ''), 10) || 0;
      let action: 'modified' | 'created' | 'deleted' = 'modified';
      if (changePart.includes('Bin') || changePart.includes('(new')) action = 'created';
      if (changePart.includes('(deleted')) action = 'deleted';
      return { path, action, lines_changed: linesChanged };
    });
  } catch {
    return [];
  }
}

function truncate(content: string, maxBytes: number = MAX_FILE_SIZE): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  if (bytes.length <= maxBytes) return content;
  let cut = maxBytes;
  while (cut > 0 && (bytes[cut] & 0b11000000) === 0b10000000) cut--;
  const truncated = new TextDecoder().decode(bytes.slice(0, cut));
  return truncated + '\n\n[TRUNCATED]';
}

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

function generateSoulId(agentId: string, projectRoot: string): string {
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const sha = gitShortSha(projectRoot);
  return `${agentId}-${ts}-${sha}`;
}

function uniqueSoulDir(baseId: string, soulsDir: string): { soulId: string; soulPath: string } {
  let soulId = baseId;
  let soulPath = join(soulsDir, soulId);
  let version = 2;
  while (existsSync(soulPath)) {
    soulId = `${baseId}-v${version}`;
    soulPath = join(soulsDir, soulId);
    version++;
  }
  return { soulId, soulPath };
}

export async function exportSoul(options: SoulExportOptions): Promise<SoulExportResult> {
  const { projectRoot, busRoot, soulsDir, projectId } = resolvePaths(options);

  const baseId = generateSoulId(options.agentId, projectRoot);
  const { soulId, soulPath } = uniqueSoulDir(baseId, soulsDir);
  mkdirSync(soulPath, { recursive: true });

  const branch = gitBranch(projectRoot);
  const commit = gitShortSha(projectRoot);
  const commitMessage = gitCommitMessage(projectRoot);
  const diff = options.includeDiff !== false ? gitDiff(projectRoot) : '';
  const filesTouched = gitStat(projectRoot);

  // Session state
  const lastSession = readJsonSafe<Record<string, unknown>>(join(SESSION_DIR, 'last-session-end.json'), {});
  const handoff = readJsonSafe<Record<string, unknown>>(join(SESSION_DIR, 'compaction-handoff.json'), {});

  const sessionQuality = (lastSession.session_quality as number) ?? 0;
  const knowledgeMissed = (lastSession.knowledge_missed as boolean) ?? false;
  const lastTask = (handoff.last_task as string) || (lastSession.last_task as string) || 'unknown';
  const turnCount = (handoff.turn_count as number) || 0;

  // Build soul files
  const activeTask = lastTask !== 'unknown' ? lastTask : (filesTouched.length > 0 ? `Work on ${filesTouched[0].path}` : 'unknown');

  const soulContext = `# Soul Context — ${soulId}
## Active Task
${activeTask}

## Session Quality
Score: ${sessionQuality}/10
Knowledge Missed: ${knowledgeMissed}
Turn Count: ${turnCount}

## Files Touched
${filesTouched.map(f => `- ${f.action}: ${f.path} (${f.lines_changed} lines)`).join('\n') || 'None'}
`;

  const soulResume = `# Soul Resume — ${soulId}
## Checkpoint
- Agent: ${options.agentId} (${options.agentRole})
- Exported: ${nowIso()}
- Reason: ${options.exportReason}

## Current State
- Branch: ${branch}
- Commit: ${commit}
- Build Status: unknown (run tests to verify)

## What To Do Next
1. Review diff in soul-diff.patch
2. Run tests
3. Continue from active task
`;

  const soulAssumptions = `# Soul Assumptions — ${soulId}
## Active Assumptions
- Working on branch ${branch}
- Project root: ${projectRoot}
- Project ID: ${projectId}
`;

  const soulDecisions = `# Soul Decisions — ${soulId}
## Decisions Taken This Session
${filesTouched.length > 0 ? `- Modified ${filesTouched.length} file(s)` : '- No files modified'}
`;

  const soulAudit = `# Soul Audit — ${soulId}
## Session Summary
- Export Reason: ${options.exportReason}
- Exported By: ${options.agentId}
- Time: ${nowIso()}
- Files: ${filesTouched.length}
- Session Quality: ${sessionQuality}
`;

  const soulKnowledge = `# Soul Knowledge — ${soulId}
## New Knowledge Generated
${knowledgeMissed ? 'WARNING: Knowledge was missed in this session.' : 'No explicit knowledge items flagged.'}
`;

  const soulVerification: Record<string, unknown> = {
    soul_id: soulId,
    exported_at: nowIso(),
    v1v8: {
      overall: 'pending',
      gates: [],
    },
  };

  const manifest: SoulManifest = {
    soul_id: soulId,
    agent_id: options.agentId,
    agent_role: options.agentRole,
    session_id: (lastSession.session_id as string) || 'unknown',
    project: projectId,
    project_root: projectRoot,
    git_branch: branch,
    git_commit: commit,
    git_commit_message: commitMessage,
    parent_soul_id: null,
    child_soul_ids: [],
    created_at: nowIso(),
    exported_by: options.exportReason,
    export_reason: options.exportReason,
    status: 'active',
    files_touched: filesTouched,
    services_affected: [],
    tests_run: 'unknown',
    build_status: 'unknown',
    next_steps: ['Review soul-diff.patch', 'Run tests', 'Continue active task'],
    blockers: [],
    risk_score: 5,
    elite_constitution_version: '2.0',
    memory_files_included: ['context', 'resume', 'assumptions', 'decisions'],
    estimated_tokens: 0,
  };

  // Write files (truncated)
  const filesWritten: string[] = [];
  const writeSoulFile = (name: string, content: string) => {
    const path = join(soulPath, name);
    writeFileSync(path, truncate(content), 'utf-8');
    filesWritten.push(name);
  };

  writeSoulFile('soul-context.md', soulContext);
  writeSoulFile('soul-resume.md', soulResume);
  writeSoulFile('soul-assumptions.md', soulAssumptions);
  writeSoulFile('soul-decisions.md', soulDecisions);
  writeSoulFile('soul-audit.md', soulAudit);
  writeSoulFile('soul-knowledge.md', soulKnowledge);
  writeSoulFile('soul-diff.patch', diff);
  writeSoulFile('soul-verification.json', JSON.stringify(soulVerification, null, 2));

  // Calculate estimated tokens
  const totalChars = filesWritten.reduce((sum, name) => {
    try {
      return sum + readFileSync(join(soulPath, name), 'utf-8').length;
    } catch {
      return sum;
    }
  }, 0);
  manifest.estimated_tokens = Math.ceil(totalChars / 4);

  writeSoulFile('soul-manifest.json', JSON.stringify(manifest, null, 2));

  // Update registry atomically
  const registryPath = join(soulsDir, 'registry.json');
  const registry: SoulRegistry = existsSync(registryPath)
    ? readJsonSafe<SoulRegistry>(registryPath, { version: '1.0', project: projectId, souls: [] })
    : { version: '1.0', project: projectId, souls: [] };

  registry.souls.push({
    soulId,
    agentId: options.agentId,
    agentRole: options.agentRole,
    status: 'active',
    createdAt: manifest.created_at,
    consumedAt: undefined,
    consumedBy: undefined,
    soulPath,
    estimatedTokens: manifest.estimated_tokens,
  });

  atomicWrite(registryPath, JSON.stringify(registry, null, 2));

  recordEvent('soul_exported', {
    project: projectId,
    agent: options.agentId,
    soul_id: soulId,
    estimated_tokens: manifest.estimated_tokens,
  });
  recordCounter('souls_exported', 1, projectId);

  return {
    soulId,
    soulPath,
    filesWritten,
    estimatedTokens: manifest.estimated_tokens,
  };
}
