#!/usr/bin/env tsx
/**
 * Swarm Orchestrate — One-shot CLI with Elite Trigger + Auto-Detection support
 * Usage: npx tsx bin/swarm-orchestrate.ts "[APPROVED]"
 *        npx tsx bin/swarm-orchestrate.ts "plan only: Implement feature X"
 *        npx tsx bin/swarm-orchestrate.ts "Implement feature X"  (auto-detected)
 */

import { orchestrate } from '../src/index.js';
import { parseTrigger } from '../src/trigger-router.js';
import { loadPending, markApproved, clearPending } from '../src/trigger-pending.js';
import { runAutoDetection } from '../src/auto-trigger/router.js';
import { resolveProjectId } from '../src/project/resolver.js';

const request = process.argv.slice(2).join(' ');

if (!request) {
  console.error('Usage: npx tsx bin/swarm-orchestrate.ts "<your task>"');
  process.exit(1);
}

const trigger = parseTrigger(request);

async function main() {
  // ── AUTO-DETECTION ──────────────────────────────────────────────────
  // If user did NOT write a trigger, run auto-detection
  let autoDecision: Awaited<ReturnType<typeof runAutoDetection>> | null = null;
  let effectiveTrigger = trigger;

  if (trigger.type === 'none') {
    console.log('🤖 No trigger detected. Running auto-detection...\n');
    autoDecision = await runAutoDetection(request, resolveProjectId());
    console.log(autoDecision.explanation);
    console.log(`   Confidence: ${Math.round(autoDecision.confidence * 100)}%`);
    console.log();

    // Map auto-decision to trigger type
    switch (autoDecision.mode) {
      case 'light':
        effectiveTrigger = { type: 'light', cleanRequest: request };
        break;
      case 'plan-only':
        effectiveTrigger = { type: 'plan-only', cleanRequest: request };
        break;
      case 'challenge':
        effectiveTrigger = { type: 'challenge', cleanRequest: '', subject: request };
        break;
      case 'normal':
      default:
        effectiveTrigger = { type: 'none', cleanRequest: request };
        break;
    }
  } else {
    console.log(`👤 User trigger detected: ${trigger.type}`);
    console.log('   Auto-detection skipped (manual override).\n');
  }

  // ── EXECUTION SWITCH ────────────────────────────────────────────────
  switch (effectiveTrigger.type) {
    case 'plan-only': {
      const result = await orchestrate(effectiveTrigger.cleanRequest, { dryRun: true });
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
      const pending = markApproved(effectiveTrigger.scope);
      if (!pending) {
        console.error('❌ No pending plan found. Run "plan only: <task>" first.');
        process.exit(1);
      }
      console.log(`✅ Plan approved${effectiveTrigger.scope ? ` (scope: ${effectiveTrigger.scope})` : ''}`);
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
      console.log(`❌ Plan rejected${effectiveTrigger.reason ? `: ${effectiveTrigger.reason}` : ''}`);
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
      const result = await runChallenge(effectiveTrigger.subject || 'current plan');
      
      console.log(result.summary);
      console.log(`\n📊 Word count: ${result.wordCount}`);
      console.log(`🎯 Overall risk: ${result.overallRisk}/25`);
      
      if (result.wordCount < 400) {
        console.log('⚠️  Warning: Output <400 words. Expanding analysis...');
      }

      // After challenge, if auto-detected, suggest continuing with plan-only
      if (autoDecision?.mode === 'challenge') {
        console.log('\n⏸️  Challenge complete. Run with "plan only:" to see execution plan.');
      }
      break;
    }

    case 'light': {
      const result = await orchestrate(effectiveTrigger.cleanRequest, { light: true });
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

      // If auto-detected, show override hint
      if (autoDecision?.mode === 'light') {
        console.log('\n💡 This was auto-detected as trivial. Say "plan only:" for full plan.');
      }
      break;
    }

    default: {
      // Normal mode (no trigger or auto-detected normal)
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
