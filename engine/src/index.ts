/**
 * Kimi Swarm Engine — Main Entry Point
 * Orchestrates context partitioning and worker delegation.
 * Extended with Soul Export/Import, Swarm Locks, Elite Constitution Bridge,
 * and Project-Agnostic Registry.
 * Version: 0.3.0-project-agnostic
 */

import { partitionTask, buildTaskBrief, printPartition } from './partitioner/index.js';
import { generateAllPrompts, printDelegationPlan, writeTaskToBus, writePromptsToBus } from './delegator/index.js';
import type { PartitionRequest, PartitionResult } from './partitioner/index.js';
import { DEFAULT_CONFIG } from './types/index.js';
import type { TaskBrief } from './types/index.js';
import type { WorkerPrompt } from './delegator/index.js';
import type { OrchestrateOptions, OrchestrateResult } from './types/index.js';
import { getProject } from './project/registry.js';
import { resolveProjectId } from './project/resolver.js';

// Project System (agnostic)
export { loadRegistry, getProject, registerProject, validateProjectConfig, rebuildRegistry, rebuildAllRegistry } from './project/registry.js';
export { resolveProjectId, resolveProjectConfig, resolveProjectFromCwd } from './project/resolver.js';
export { detectLanguage, detectFramework, detectServicePatterns } from './project/detector.js';
export type { ProjectConfig, ProjectRegistry, LanguageIndexer } from './project/types.js';

// Indexer System
export { buildProjectMap } from './indexer/index.js';

// Soul System
export { exportSoul } from './soul/export.js';
export { importSoul, findPendingSouls, previewSoul } from './soul/import.js';
export {
  loadConstitution,
  injectConstitutionIntoWorkerPrompt,
  runV1V8Gates,
  formatResponseContract,
  checkBoundedMemoryThreshold,
} from './soul/constitution-bridge.js';

// Swarm Lock System
export {
  acquireLock,
  releaseLock,
  checkConflicts,
  cleanupExpiredLocks,
  listActiveLocks,
  extendLock,
} from './swarm/lock-manager.js';

export {
  // Partitioner
  partitionTask,
  buildTaskBrief,
  printPartition,
  // Delegator
  generateAllPrompts,
  printDelegationPlan,
  writeTaskToBus,
  writePromptsToBus,
};

export type { PartitionRequest, PartitionResult, TaskBrief, WorkerPrompt };

// Telemetry
export { recordEvent, recordMetric, recordCounter, recordGauge, recordHistogram } from './telemetry/collector.js';
export type { TelemetryEvent, TelemetryMetric, MetricDefinition } from './telemetry/types.js';

/** Full orchestration pipeline */
export async function orchestrate(
  userRequest: string,
  options?: OrchestrateOptions
): Promise<OrchestrateResult> {
  console.log(`🐝 Swarm Engine v0.3.0 — Project-Agnostic`);
  console.log(`Request: "${userRequest}"`);
  if (options?.dryRun) console.log(`Mode: PLAN ONLY (dry run)`);
  if (options?.light) console.log(`Mode: LIGHT (skip swarm)`);
  console.log();

  // LIGHT MODE: skip everything
  if (options?.light) {
    return {
      brief: {
        taskId: `light-${Date.now()}`,
        project: resolveProjectId(),
        taskType: 'bug-fix',
        objective: userRequest,
        userRequest,
        contextChunks: [],
        constraints: ['Light mode: V1+V3+V5 only'],
        successCriteria: ['Compiles', 'No secrets', 'Matches spec'],
        estimatedTotalTokens: 0,
        requiresPartitioning: false,
      } as TaskBrief,
      prompts: [],
    };
  }

  // 1. Partition
  const projectId = resolveProjectId();
  const partition = await partitionTask({ userRequest, projectId });
  console.log(printPartition(partition));

  // 2. Build brief
  const brief = buildTaskBrief({ userRequest, projectId }, partition);

  // 3. Generate prompts
  const prompts = generateAllPrompts(brief);
  console.log('\n' + printDelegationPlan(prompts));

  // DRY RUN: don't write to bus, save pending state
  if (options?.dryRun) {
    const { savePending } = await import('./trigger-pending.js');
    savePending({
      taskId: brief.taskId,
      request: userRequest,
      partitionJson: JSON.stringify(partition),
      briefJson: JSON.stringify(brief),
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    console.log('\n⏸️  PLAN ONLY — Task NOT written to bus');
    console.log('   Review the plan above.');
    console.log('   Say [APPROVED] to execute or REJECT to cancel.');
    return { brief, prompts, dryRun: true, pendingApproval: true };
  }

  // 4. Write to bus (normal execution or approved)
  await writeTaskToBus(brief);
  await writePromptsToBus(prompts);
  console.log('\n✅ Task written to message bus');
  const project = getProject(brief.project);
  const busRoot = project?.busRoot ?? DEFAULT_CONFIG.busRoot;
  console.log(`   Prompts saved to: ${busRoot}/bus/prompts/`);

  return { brief, prompts };
}
