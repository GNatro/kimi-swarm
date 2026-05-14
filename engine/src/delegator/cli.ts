#!/usr/bin/env tsx
/**
 * Delegator CLI
 * Usage: npx tsx src/delegator/cli.ts <task-id>
 * Or: npx tsx src/delegator/cli.ts --from-brief <path-to-brief.json>
 */

import { readFile } from 'fs/promises';
import { generateAllPrompts, printDelegationPlan, writeTaskToBus } from './index.js';
import type { TaskBrief } from '../types/index.js';

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--from-brief' && args[1]) {
    const briefJson = await readFile(args[1], 'utf-8');
    const brief = JSON.parse(briefJson) as TaskBrief;
    const prompts = generateAllPrompts(brief);
    console.log(printDelegationPlan(prompts));

    // Write to bus
    await writeTaskToBus(brief);
    console.log('\n✅ Task written to bus');

    // Print prompts for manual use
    for (const p of prompts) {
      console.log(`\n--- PROMPT for ${p.subtaskId} ---\n`);
      console.log(p.prompt);
    }
  } else {
    console.log('Usage: npx tsx src/delegator/cli.ts --from-brief <path-to-brief.json>');
    console.log('       npx tsx src/delegator/cli.ts --from-partition');
  }
}

main().catch(console.error);
