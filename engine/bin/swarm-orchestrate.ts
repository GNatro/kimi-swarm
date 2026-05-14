#!/usr/bin/env tsx
/**
 * Swarm Orchestrate — One-shot CLI
 * Usage: npx tsx bin/swarm-orchestrate.ts "Implement feature X"
 */

import { orchestrate } from '../src/index.js';

const request = process.argv.slice(2).join(' ');

if (!request) {
  console.error('Usage: npx tsx bin/swarm-orchestrate.ts "<your task>"');
  process.exit(1);
}

orchestrate(request)
  .then(({ brief, prompts }) => {
    console.log(`\n🎯 Task ${brief.taskId} ready for delegation`);
    console.log(`   ${prompts.length} worker(s) to launch`);
    console.log(`\n📁 Worker prompts saved to:`);
    for (const p of prompts) {
      console.log(`   ~/shared-context/polybot/bus/prompts/${p.subtaskId}.md`);
    }
    console.log(`\nNext step: Read prompt file and execute Agent(subagent_type="${prompts[0]?.workerType || 'coder'}")`);
  })
  .catch((err) => {
    console.error('Orchestration failed:', err);
    process.exit(1);
  });
