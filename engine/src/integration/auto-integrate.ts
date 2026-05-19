/**
 * Auto-Integration Script
 * Reads worker responses from the bus and generates/applys an integration plan.
 */

import { readFile, readdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';
import type { WorkerResult, IntegrationPlan, Conflict } from '../types/index.js';
import { DEFAULT_CONFIG } from '../types/index.js';

const BUS_DIR = join(DEFAULT_CONFIG.busRoot, 'bus');
const RESPONSES_DIR = join(BUS_DIR, 'responses');
const REQUESTS_DIR = join(BUS_DIR, 'requests');

interface PendingTask {
  taskId: string;
  requestFile: string;
  responseFiles: string[];
  status: 'pending' | 'partial' | 'ready';
}

/** Find all pending tasks in the bus */
export async function findPendingTasks(): Promise<PendingTask[]> {
  const tasks: PendingTask[] = [];

  // Read requests
  try {
    const requestFiles = await readdir(REQUESTS_DIR);
    for (const file of requestFiles) {
      if (file.endsWith('.json')) {
        const request = JSON.parse(await readFile(join(REQUESTS_DIR, file), 'utf-8'));
        const taskId = request.taskId || file.replace('.json', '');
        tasks.push({
          taskId,
          requestFile: join(REQUESTS_DIR, file),
          responseFiles: [],
          status: 'pending',
        });
      }
    }
  } catch {
    return [];
  }

  // Match responses
  try {
    const responseFiles = await readdir(RESPONSES_DIR);
    for (const file of responseFiles) {
      if (file.endsWith('-result.md')) {
        // Extract base taskId from patterns like:
        //   task-123-sub-1-result.md -> task-123
        //   task-123-single-result.md -> task-123
        //   task-123-result.md -> task-123
        let taskId: string | null = null;
        const subMatch = file.match(/^(task-\d+)-sub-\d+-result\.md$/);
        const singleMatch = file.match(/^(task-\d+)-single-result\.md$/);
        const directMatch = file.match(/^(task-\d+)-result\.md$/);
        if (subMatch) taskId = subMatch[1];
        else if (singleMatch) taskId = singleMatch[1];
        else if (directMatch) taskId = directMatch[1];

        if (taskId) {
          const task = tasks.find((t) => t.taskId === taskId);
          if (task) {
            task.responseFiles.push(join(RESPONSES_DIR, file));
          }
        }
      }
    }
  } catch {
    // No responses yet
  }

  // Update status
  for (const task of tasks) {
    const request = JSON.parse(await readFile(task.requestFile, 'utf-8'));
    const expectedSubtasks = request.subtasks?.length || 1;
    if (task.responseFiles.length >= expectedSubtasks) {
      task.status = 'ready';
    } else if (task.responseFiles.length > 0) {
      task.status = 'partial';
    }
  }

  return tasks;
}

/** Parse a worker result from markdown */
export function parseWorkerResult(markdown: string, subtaskId: string): WorkerResult {
  const result: WorkerResult = {
    subtaskId,
    workerType: 'coder',
    status: 'completed',
    summary: '',
    changesMade: [],
    technicalNotes: '',
    testsValidation: '',
    filesModified: [],
    contextUsed: { briefTokens: 0, contextWindowStart: 0, contextWindowEnd: 0 },
    nextSteps: [],
    timestamp: new Date().toISOString(),
  };

  // Extract status
  const statusMatch = markdown.match(/Status:\s*(completed|partial|blocked|failed)/i);
  if (statusMatch) result.status = statusMatch[1] as WorkerResult['status'];

  // Extract summary (first ## Summary or first paragraph)
  const summaryMatch = markdown.match(/##\s*Summary\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (summaryMatch) result.summary = summaryMatch[1].trim();

  // Extract changes made
  const changesMatch = markdown.match(/##\s*Changes\s*Made\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (changesMatch) {
    result.changesMade = changesMatch[1]
      .split('\n')
      .filter((l) => l.trim().startsWith('-') || l.trim().startsWith('*'))
      .map((l) => l.replace(/^[-*]\s*/, '').trim());
  }

  // Extract files modified
  const filesMatch = markdown.match(/##\s*Files\s*(?:Modified|Changed)\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (filesMatch) {
    const lines = filesMatch[1].split('\n');
    for (const line of lines) {
      const m = line.match(/^[-*]\s*`?(.+?)`?\s*:\s*(modified|created|deleted)/i);
      if (m) {
        result.filesModified.push({ path: m[1].trim(), action: m[2] as 'modified' | 'created' | 'deleted' });
      }
    }
  }

  // Extract tests validation
  const testsMatch = markdown.match(/##\s*Tests?\s*(?:Validation|Results?)\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (testsMatch) result.testsValidation = testsMatch[1].trim();

  // Extract next steps
  const nextMatch = markdown.match(/##\s*Next\s*Steps?\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (nextMatch) {
    result.nextSteps = nextMatch[1]
      .split('\n')
      .filter((l) => l.trim().startsWith('-') || l.trim().startsWith('*'))
      .map((l) => l.replace(/^[-*]\s*/, '').trim());
  }

  return result;
}

/** Generate integration plan from pending task */
export async function generateIntegrationPlan(task: PendingTask): Promise<IntegrationPlan> {
  const results: WorkerResult[] = [];
  const allModifiedFiles = new Set<string>();
  const conflicts: Conflict[] = [];

  for (const responseFile of task.responseFiles) {
    const markdown = await readFile(responseFile, 'utf-8');
    const subtaskId = responseFile.match(/(task-[^/]+-sub-\d+|task-[^/]+)(?=-result\.md$)/)?.[1] || 'unknown';
    const result = parseWorkerResult(markdown, subtaskId);
    results.push(result);

    for (const file of result.filesModified) {
      if (allModifiedFiles.has(file.path) && file.action === 'modified') {
        conflicts.push({
          files: [file.path],
          description: `File ${file.path} modified by multiple workers`,
          severity: 'high',
        });
      }
      allModifiedFiles.add(file.path);
    }
  }

  // Determine apply order (simple: created first, then modified, deleted last)
  const created = Array.from(allModifiedFiles).filter((f) =>
    results.some((r) => r.filesModified.some((fm) => fm.path === f && fm.action === 'created'))
  );
  const modified = Array.from(allModifiedFiles).filter((f) =>
    results.some((r) => r.filesModified.some((fm) => fm.path === f && fm.action === 'modified'))
  );
  const deleted = Array.from(allModifiedFiles).filter((f) =>
    results.some((r) => r.filesModified.some((fm) => fm.path === f && fm.action === 'deleted'))
  );

  return {
    taskId: task.taskId,
    results,
    conflicts,
    applyOrder: [...created, ...modified, ...deleted],
    validationSteps: [
      'Run TypeScript build: npm run build',
      'Run affected tests',
      'Verify no unintended changes with git diff',
    ],
  };
}

/** Generate markdown report for the orchestrator */
export function generateIntegrationReport(plan: IntegrationPlan): string {
  const lines: string[] = [];

  lines.push(`# Integration Plan: ${plan.taskId}`);
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  lines.push('## Worker Results Summary');
  lines.push('');
  for (const result of plan.results) {
    const statusEmoji = result.status === 'completed' ? '✅' : result.status === 'partial' ? '⚠️' : '❌';
    lines.push(`### ${statusEmoji} ${result.subtaskId} (${result.status})`);
    if (result.summary) lines.push(result.summary);
    if (result.filesModified.length > 0) {
      lines.push('**Files:**');
      for (const f of result.filesModified) {
        const emoji = f.action === 'created' ? '🆕' : f.action === 'deleted' ? '🗑️' : '✏️';
        lines.push(`- ${emoji} \`${f.path}\` (${f.action})`);
      }
    }
    if (result.testsValidation) {
      lines.push('**Tests:** ' + result.testsValidation.split('\n')[0]);
    }
    lines.push('');
  }

  if (plan.conflicts.length > 0) {
    lines.push('## ⚠️ Conflicts Detected');
    lines.push('');
    for (const conflict of plan.conflicts) {
      lines.push(`- **${conflict.severity.toUpperCase()}**: ${conflict.description}`);
      lines.push(`  Files: ${conflict.files.join(', ')}`);
    }
    lines.push('');
  }

  lines.push('## Suggested Apply Order');
  lines.push('');
  for (const file of plan.applyOrder) {
    lines.push(`1. \`${file}\``);
  }
  lines.push('');

  lines.push('## Validation Steps');
  lines.push('');
  for (const step of plan.validationSteps) {
    lines.push(`- [ ] ${step}`);
  }
  lines.push('');

  lines.push('## Next Actions for Orchestrator');
  lines.push('');
  lines.push('1. Read each worker result in detail');
  lines.push('2. Apply changes using WriteFile/StrReplaceFile');
  lines.push('3. Resolve any conflicts manually');
  lines.push('4. Run validation steps');
  lines.push('5. Mark task as integrated and archive');
  lines.push('');

  return lines.join('\n');
}

/** CLI entry point */
async function main() {
  const args = process.argv.slice(2);
  const taskId = args[0];

  if (taskId === '--list') {
    const tasks = await findPendingTasks();
    console.log('Pending tasks:');
    for (const task of tasks) {
      console.log(`  ${task.taskId}: ${task.status} (${task.responseFiles.length} responses)`);
    }
    return;
  }

  const tasks = await findPendingTasks();
  const targetTask = taskId ? tasks.find((t) => t.taskId === taskId) : tasks.find((t) => t.status === 'ready');

  if (!targetTask) {
    console.error(taskId ? `Task ${taskId} not found or not ready.` : 'No ready tasks found.');
    process.exit(1);
  }

  console.log(`Integrating task: ${targetTask.taskId}...`);
  const plan = await generateIntegrationPlan(targetTask);
  const report = generateIntegrationReport(plan);

  const reportPath = join(BUS_DIR, 'integration-plans', `${targetTask.taskId}-integration.md`);
  await writeFile(reportPath, report, 'utf-8');
  console.log(`Integration report written to: ${reportPath}`);

  if (plan.conflicts.length === 0) {
    console.log('✅ No conflicts detected. Ready to apply.');
  } else {
    console.log(`⚠️ ${plan.conflicts.length} conflict(s) need manual resolution.`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
