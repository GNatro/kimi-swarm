#!/usr/bin/env tsx
/**
 * Swarm Orchestrate — One-shot CLI with Elite Trigger support
 * Usage: npx tsx bin/swarm-orchestrate.ts "[APPROVED]"
 *        npx tsx bin/swarm-orchestrate.ts "plan only: Implement feature X"
 */

import { orchestrate } from '../src/index.js';
import { parseTrigger } from '../src/trigger-router.js';
import { loadPending, markApproved, clearPending } from '../src/trigger-pending.js';

const request = process.argv.slice(2).join(' ');

if (!request) {
  console.error('Usage: npx tsx bin/swarm-orchestrate.ts "<your task>"');
  process.exit(1);
}

const trigger = parseTrigger(request);

async function main() {
  switch (trigger.type) {
    case 'plan-only': {
      const result = await orchestrate(trigger.cleanRequest, { dryRun: true });
      // Output formatted for human review
      console.log('\n═══════════════════════════════════════');
      console.log('📋 PLAN PREVIEW (NOT EXECUTING)');
      console.log('═══════════════════════════════════════');
      console.log(`Task ID: ${result.brief.taskId}`);
      console.log(`Workers: ${result.prompts.length}`);
      console.log(`Tokens: ${result.brief.estimatedTotalTokens.toLocaleString()}`);
      console.log('\nWorkers:');
      for (const p of result.prompts) {
        console.log(`  • ${p.subtaskId} (${p.workerType})`);
      }
      console.log('\n⏸️  Waiting for approval...');
      console.log('   Say: [APPROVED]');
      console.log('   Or:  [APPROVED] <scope>');
      console.log('   Or:  REJECT — <reason>');
      break;
    }

    case 'approved': {
      const pending = markApproved(trigger.scope);
      if (!pending) {
        console.error('❌ No pending plan found. Run "plan only: <task>" first.');
        process.exit(1);
      }
      console.log(`✅ Plan approved${trigger.scope ? ` (scope: ${trigger.scope})` : ''}`);
      const result = await orchestrate(pending.request, { approved: true });
      console.log(`\n🎯 Task ${result.brief.taskId} ready for delegation`);
      console.log(`   ${result.prompts.length} worker(s) to launch`);
      for (const p of result.prompts) {
        console.log(`   ~/shared-context/${result.brief.project}/bus/prompts/${p.subtaskId}.md`);
      }
      break;
    }

    case 'reject': {
      clearPending();
      console.log(`❌ Plan rejected${trigger.reason ? `: ${trigger.reason}` : ''}`);
      console.log('   Run "plan only: <task>" to create a new plan.');
      break;
    }

    case 'light': {
      const result = await orchestrate(trigger.cleanRequest, { light: true });
      console.log('\n⚡ LIGHT MODE — Swarm skipped');
      console.log('   V1 (Build): manual check required');
      console.log('   V3 (Safety): manual check required');
      console.log('   V5 (Spec): manual check required');
      console.log(`   Task: ${result.brief.objective}`);
      break;
    }

    default: {
      // Normal mode (no trigger or unknown)
      const result = await orchestrate(request);
      console.log(`\n🎯 Task ${result.brief.taskId} ready for delegation`);
      console.log(`   ${result.prompts.length} worker(s) to launch`);
      for (const p of result.prompts) {
        console.log(`   ~/shared-context/${result.brief.project}/bus/prompts/${p.subtaskId}.md`);
      }
      console.log(`\nNext step: Read prompt file and execute Agent(subagent_type="${result.prompts[0]?.workerType || 'coder'}")`);
    }
  }
}

main().catch((err) => {
  console.error('Orchestration failed:', err);
  process.exit(1);
});
