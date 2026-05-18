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
      process.env.SWARM_PROJECT_ID = pending.projectId;
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

    case 'audit': {
      console.log('\n🔍 Running self-audit...');
      const { execSync } = await import('child_process');
      try {
        const output = execSync('bash ~/brain-stack/scripts/audit-self.sh 10', { encoding: 'utf-8' });
        console.log(output);
      } catch (err) {
        console.error('Audit failed:', err);
      }
      break;
    }

    case 'challenge': {
      const { runChallenge } = await import('../src/challenge-engine.js');
      const result = await runChallenge(trigger.subject || 'current plan');
      
      console.log(result.summary);
      console.log(`\n📊 Word count: ${result.wordCount}`);
      console.log(`🎯 Overall risk: ${result.overallRisk}/25`);
      
      if (result.wordCount < 400) {
        console.log('⚠️  Warning: Output <400 words. Expanding analysis...');
      }
      break;
    }

    case 'light': {
      const result = await orchestrate(trigger.cleanRequest, { light: true });
      console.log('\n⚡ LIGHT MODE — Swarm skipped');
      console.log(`Task: ${result.brief.objective}`);
      console.log('\nRunning V1+V3+V5 checks...\n');
      
      const { runLightChecks } = await import('../src/trigger-light.js');
      const projectRoot = process.cwd();
      const checks = await runLightChecks(projectRoot);
      
      for (const check of checks.checks) {
        const icon = check.passed ? '✅' : '❌';
        console.log(`${icon} ${check.check}: ${check.details}`);
      }
      
      console.log(`\n${checks.recommendation}`);
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
