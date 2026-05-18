/**
 * Worker Checkpoint System
 * Allows workers to save progress periodically and recover from timeouts.
 */

import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { DEFAULT_CONFIG } from '../types/index.js';
import { getProject } from '../project/registry.js';

export interface Checkpoint {
  checkpointId: string;
  subtaskId: string;
  timestamp: string;
  status: 'in_progress' | 'completed' | 'failed';
  completedSteps: string[];
  pendingSteps: string[];
  filesModified: string[];
  notes: string;
  buildStatus?: 'pass' | 'fail' | 'not_run';
  testStatus?: 'pass' | 'fail' | 'not_run';
}

function getCheckpointDir(project: string): string {
  const config = getProject(project);
  const busRoot = config?.busRoot ?? DEFAULT_CONFIG.busRoot;
  return join(busRoot, 'checkpoints');
}

/** Save a checkpoint */
export async function saveCheckpoint(
  checkpoint: Checkpoint,
  project: string
): Promise<void> {
  const dir = getCheckpointDir(project);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${checkpoint.subtaskId}-${checkpoint.checkpointId}.json`);
  await writeFile(path, JSON.stringify(checkpoint, null, 2));
}

/** Load the latest checkpoint for a subtask */
export async function loadLatestCheckpoint(
  subtaskId: string,
  project: string
): Promise<Checkpoint | null> {
  try {
    const dir = getCheckpointDir(project);
    const content = await readFile(join(dir, `${subtaskId}-latest.json`), 'utf-8');
    return JSON.parse(content) as Checkpoint;
  } catch {
    return null;
  }
}

/** Create a heartbeat checkpoint */
export async function heartbeat(
  subtaskId: string,
  step: string,
  project: string
): Promise<void> {
  const checkpoint: Checkpoint = {
    checkpointId: `hb-${Date.now()}`,
    subtaskId,
    timestamp: new Date().toISOString(),
    status: 'in_progress',
    completedSteps: [step],
    pendingSteps: [],
    filesModified: [],
    notes: `Heartbeat: completed step "${step}"`,
  };
  await saveCheckpoint(checkpoint, project);
  // Also save as latest
  const dir = getCheckpointDir(project);
  await writeFile(
    join(dir, `${subtaskId}-latest.json`),
    JSON.stringify(checkpoint, null, 2)
  );
}

/** Generate checkpoint instructions for worker prompts */
export function getCheckpointInstructions(subtaskId: string, project: string): string {
  const config = getProject(project);
  const busRoot = config?.busRoot ?? DEFAULT_CONFIG.busRoot;
  const checkpointDir = join(busRoot, 'checkpoints');
  return `
## Checkpoint System (CRITICAL)

Every 2-3 minutes, or after completing a significant step, save your progress:

\`\`\`bash
# Save checkpoint
echo '{
  "checkpointId": "${Date.now()}",
  "subtaskId": "${subtaskId}",
  "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
  "status": "in_progress",
  "completedSteps": ["step1", "step2"],
  "pendingSteps": ["step3", "step4"],
  "filesModified": ["path/to/file.ts"],
  "notes": "What you completed and what's next",
  "buildStatus": "pass",
  "testStatus": "not_run"
}' > ${checkpointDir}/${subtaskId}-latest.json
\`\`\`

This prevents losing work if you timeout. The orchestrator will read this file to recover your progress.
`;
}
