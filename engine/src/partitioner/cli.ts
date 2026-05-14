#!/usr/bin/env tsx
/**
 * Partitioner CLI
 * Usage: npx tsx src/partitioner/cli.ts "Fix the position monitor exit rules"
 */

import { partitionTask, buildTaskBrief, printPartition } from './index.js';

const request = process.argv.slice(2).join(' ') || 'Fix bug in position monitor exit rules';

async function main() {
  console.log(`🔍 Analyzing request: "${request}"\n`);

  const partition = await partitionTask({ userRequest: request });
  console.log(printPartition(partition));

  if (partition.needsPartitioning) {
    const brief = buildTaskBrief({ userRequest: request }, partition);
    console.log(`\n📋 Task Brief Generated:`);
    console.log(`  Task ID: ${brief.taskId}`);
    console.log(`  Type: ${brief.taskType}`);
    console.log(`  Subtasks: ${brief.subtasks?.length}`);
    for (const st of brief.subtasks || []) {
      console.log(`\n  ${st.subtaskId} → ${st.workerType}`);
      console.log(`    Objective: ${st.objective}`);
      console.log(`    Files: ${st.inputArtifacts.length}`);
      console.log(`    Dependencies: ${st.dependencies.join(', ') || 'none'}`);
    }
  } else if (partition.chunks.length === 1) {
    console.log(`\n✅ Single worker task. Files:`);
    for (const f of partition.chunks[0].files.slice(0, 10)) {
      console.log(`  - ${f}`);
    }
    if (partition.chunks[0].files.length > 10) {
      console.log(`  ... and ${partition.chunks[0].files.length - 10} more`);
    }
  }
}

main().catch(console.error);
