/**
 * Worker Delegator
 * Generates prompts for Agent() tool and manages the task lifecycle.
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { TaskBrief, Subtask, EngineConfig } from '../types/index.js';
import { DEFAULT_CONFIG } from '../types/index.js';
import { getCheckpointInstructions } from '../utils/checkpoint.js';

/** A prompt ready to be passed to Agent() */
export interface WorkerPrompt {
  subtaskId: string;
  workerType: 'coder' | 'explore' | 'plan';
  prompt: string;
  // Files the worker should read (relative paths)
  filesToRead: string[];
  // Where to write the result
  resultPath: string;
}

/** Generate the worker prompt from a subtask */
export function generateWorkerPrompt(
  brief: TaskBrief,
  subtask: Subtask,
  config: EngineConfig = DEFAULT_CONFIG
): WorkerPrompt {
  const projectRoot = config.projectRoot;
  if (!projectRoot) throw new Error('projectRoot is required');
  const busDir = join(config.busRoot, 'bus');
  const resultPath = join(busDir, 'responses', `${subtask.subtaskId}-result.md`);

  const prompt = buildPromptText(brief, subtask, projectRoot, resultPath);

  return {
    subtaskId: subtask.subtaskId,
    workerType: subtask.workerType,
    prompt,
    filesToRead: subtask.inputArtifacts.map((f) => join(projectRoot, f)),
    resultPath,
  };
}

function buildPromptText(brief: TaskBrief, subtask: Subtask, projectRoot: string, resultPath: string): string {
  const lines: string[] = [];

  lines.push(`# Worker Brief: ${subtask.subtaskId}`);
  lines.push('');
  lines.push(`> ⏱️ You have up to 15 minutes (900s) to complete this task.`);
  lines.push(`> 💾 Save checkpoints every 2-3 minutes to prevent losing work on timeout.`);
  lines.push(`> 🎯 Focus: execute and deliver. Do not over-analyze.`);
  lines.push('');
  lines.push(`## Project`);
  lines.push(`- Name: ${brief.project}`);
  lines.push(`- Root: ${projectRoot}`);
  lines.push('');
  lines.push(`## Objective`);
  lines.push(subtask.objective);
  lines.push('');
  lines.push(`## Context`);
  lines.push(`You are working on PART of a larger task. The full request is:`);
  lines.push(`> ${brief.userRequest}`);
  lines.push('');
  lines.push(`Your scope is limited to these services/files:`);
  for (const svc of subtask.contextChunk.services) {
    lines.push(`- ${svc}`);
  }
  lines.push('');
  lines.push(`## Files to Read (${subtask.inputArtifacts.length} files)`);
  for (const f of subtask.inputArtifacts) {
    lines.push(`- ${f}`);
  }
  lines.push('');
  lines.push(`## Constraints`);
  for (const c of brief.constraints) {
    lines.push(`- ${c}`);
  }
  lines.push(`- Do NOT modify files outside your assigned scope`);
  lines.push(`- If you discover the fix requires touching other services, REPORT it`);
  lines.push('');
  lines.push(`## Success Criteria`);
  for (const sc of subtask.successCriteria) {
    lines.push(`- [ ] ${sc}`);
  }
  lines.push('');
  lines.push(`## Expected Output`);
  lines.push(subtask.expectedOutput);
  lines.push('');
  lines.push(`## Dependencies`);
  if (subtask.dependencies.length > 0) {
    lines.push(`Wait for these subtasks to complete before starting:`);
    for (const dep of subtask.dependencies) {
      lines.push(`- ${dep}`);
    }
  } else {
    lines.push(`No dependencies — you can start immediately.`);
  }
  lines.push('');
  lines.push(`## Checkpoint Instructions`);
  lines.push(getCheckpointInstructions(subtask.subtaskId, brief.project));
  lines.push('');
  lines.push(`## Delivery Instructions (MANDATORY — DO NOT SKIP)`);
  lines.push(`When done, you MUST write your result to this exact file:`);
  lines.push(`\`${resultPath}\``);
  lines.push('');
  lines.push(`⚠️ CRITICAL: If you do not write this file, the orchestrator cannot integrate your work and it will be LOST.`);
  lines.push(`Use this exact format:`);
  lines.push('```markdown');
  lines.push(`# Worker Report: ${subtask.subtaskId}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('2-3 sentences of what you did.');
  lines.push('');
  lines.push('## Changes Made');
  lines.push('- Change 1');
  lines.push('- Change 2');
  lines.push('');
  lines.push('## Technical Notes');
  lines.push('Important implementation details, caveats, decisions.');
  lines.push('');
  lines.push('## Tests / Validation');
  lines.push('- How tested? Results?');
  lines.push('');
  lines.push('## Files Modified');
  lines.push('| File | Action |');
  lines.push('|------|--------|');
  lines.push('| path/to/file.ts | modified |');
  lines.push('```');
  lines.push('');
  lines.push(`## Reminder`);
  lines.push(`You are a specialized worker. Focus ONLY on your assigned scope.`);
  lines.push(`Do not plan, do not coordinate, do not ask clarifying questions unless critical.`);
  lines.push(`Execute and deliver.`);

  return lines.join('\n');
}

/** Write a task brief to the message bus */
export async function writeTaskToBus(
  brief: TaskBrief,
  config: EngineConfig = DEFAULT_CONFIG
): Promise<void> {
  const busDir = join(config.busRoot, 'bus');
  const requestsDir = join(busDir, 'requests');
  await mkdir(requestsDir, { recursive: true });

  const filename = `${Date.now()}-${brief.taskId}.json`;
  const filepath = join(requestsDir, filename);

  await writeFile(filepath, JSON.stringify(brief, null, 2));
}

/** Write worker prompts to the message bus as .md files */
export async function writePromptsToBus(
  prompts: WorkerPrompt[],
  config: EngineConfig = DEFAULT_CONFIG
): Promise<void> {
  const busDir = join(config.busRoot, 'bus');
  const promptsDir = join(busDir, 'prompts');
  await mkdir(promptsDir, { recursive: true });

  for (const prompt of prompts) {
    const filename = `${prompt.subtaskId}.md`;
    const filepath = join(promptsDir, filename);
    await writeFile(filepath, prompt.prompt, 'utf-8');
  }
}

/** Generate all worker prompts for a task */
export function generateAllPrompts(brief: TaskBrief, config?: EngineConfig): WorkerPrompt[] {
  if (!brief.subtasks || brief.subtasks.length === 0) {
    // Single-worker task
    if (brief.directFiles) {
      const singleSubtask: Subtask = {
        subtaskId: `${brief.taskId}-single`,
        workerType: 'coder',
        objective: brief.objective,
        contextChunk: brief.contextChunks[0] || {
          chunkId: 'single',
          estimatedTokens: 0,
          files: brief.directFiles,
          services: [],
          sharedFiles: [],
          description: 'Direct task',
        },
        dependencies: [],
        inputArtifacts: brief.directFiles,
        expectedOutput: 'Code changes or analysis report',
        successCriteria: brief.successCriteria,
      };
      return [generateWorkerPrompt(brief, singleSubtask, config)];
    }
    return [];
  }

  return brief.subtasks.map((st) => generateWorkerPrompt(brief, st, config));
}

/** Print delegation plan */
export function printDelegationPlan(prompts: WorkerPrompt[]): string {
  const lines: string[] = [];
  lines.push(`Delegation Plan: ${prompts.length} worker(s)`);
  for (const p of prompts) {
    lines.push(`\n${p.subtaskId} (${p.workerType})`);
    lines.push(`  Files: ${p.filesToRead.length}`);
    lines.push(`  Result: ${p.resultPath}`);
    lines.push(`  Prompt: ~${p.prompt.length} chars (~${Math.ceil(p.prompt.length / 4)} tokens)`);
  }
  return lines.join('\n');
}
