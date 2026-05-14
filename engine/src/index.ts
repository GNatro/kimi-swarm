/**
 * Kimi Swarm Engine — Main Entry Point
 * Orchestrates context partitioning and worker delegation.
 */

import { partitionTask, buildTaskBrief, printPartition } from './partitioner/index.js';
import { generateAllPrompts, printDelegationPlan, writeTaskToBus, writePromptsToBus } from './delegator/index.js';
import type { PartitionRequest, PartitionResult } from './partitioner/index.js';
import type { TaskBrief, WorkerPrompt } from './types/index.js';

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

/** Full orchestration pipeline */
export async function orchestrate(userRequest: string): Promise<{
  brief: TaskBrief;
  prompts: WorkerPrompt[];
}> {
  console.log(`🐝 Swarm Engine v0.1.0 — Polybot MVP`);
  console.log(`Request: "${userRequest}"\n`);

  // 1. Partition
  const partition = await partitionTask({ userRequest });
  console.log(printPartition(partition));

  // 2. Build brief
  const brief = buildTaskBrief({ userRequest }, partition);

  // 3. Generate prompts
  const prompts = generateAllPrompts(brief);
  console.log('\n' + printDelegationPlan(prompts));

  // 4. Write to bus
  await writeTaskToBus(brief);
  await writePromptsToBus(prompts);
  console.log('\n✅ Task written to message bus');
  console.log(`   Prompts saved to: ~/shared-context/polybot/bus/prompts/`);

  return { brief, prompts };
}
