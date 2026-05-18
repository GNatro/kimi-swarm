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
import {
  loadPlanGraph,
  savePlanGraph,
  createPlan,
  getActivePlan,
} from '../src/anti-drift/plan-graph.js';
import { appendRecord, hashPrompt } from '../src/anti-drift/causal-registry.js';
import { createChecklist, addItem } from '../src/anti-drift/checklist-manager.js';
import { nowIso } from '../src/anti-drift/types.js';

const request = process.argv.slice(2).join(' ');

if (!request) {
  console.error('Usage: npx tsx bin/swarm-orchestrate.ts "<your task>"');
  process.exit(1);
}

const trigger = parseTrigger(request);

async function main() {
  // ── ELITE ROLE AUTO-DETECTION ───────────────────────────────────────
  const eliteRole = process.env.ELITE_ROLE as 'orchestrator' | 'worker' | undefined;
  if (eliteRole === 'orchestrator') {
    console.log('🎛️  Elite Orchestrator mode activated (via ELITE_ROLE)');
  } else if (eliteRole === 'worker') {
    console.log('🔧 Elite Worker mode activated (via ELITE_ROLE)');
    console.log('   Waiting for WORK ORDER from Orchestrator...');
    // Worker mode: do not auto-execute, just acknowledge
    process.exit(0);
  }

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

  // ── Anti-Drift v2.0: Ensure active plan exists ──────────────────────
  const graph = loadPlanGraph();
  let activePlan = getActivePlan(graph);
  if (!activePlan && effectiveTrigger.type !== 'reject' && effectiveTrigger.type !== 'audit') {
    // Create a main plan for this request
    const plan = createPlan(graph, {
      planType: 'main',
      title: request.slice(0, 60),
      description: request,
      status: 'active',
      phases: [
        { phaseId: 'p1', title: 'Execution', status: 'active', order: 1, spawnedSidePlanIds: [], recordIds: [], entryCriteria: [], exitCriteria: [] },
      ],
      currentPhaseIndex: 0,
      checklistId: `chk-${Date.now()}`,
      tags: [effectiveTrigger.type === 'none' ? 'auto' : 'manual'],
      estimatedTurns: 5,
      actualTurns: 0,
    });
    const checklist = createChecklist(plan.planId, plan.title);
    addItem(checklist, 'Execute task', 'auto');
    savePlanGraph(graph);
    activePlan = plan;
    console.log(`📋 Created plan: ${plan.title}`);
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

  // Anti-Drift v2.0: Record execution decision
  if (activePlan) {
    try {
      appendRecord({
        recordId: `rec-exec-${Date.now()}`,
        turnNumber: 0,
        timestamp: nowIso(),
        userPrompt: request,
        userPromptHash: hashPrompt(request),
        preState: {
          activePlanId: activePlan.planId,
          activePhaseId: activePlan.phases[activePlan.currentPhaseIndex]?.phaseId ?? null,
          checklistState: { checklistId: activePlan.checklistId, items: [], version: 0 },
          filesModified: [],
          pendingDecisions: [],
        },
        decision: {
          type: 'continue-plan',
          description: `Executed via ${effectiveTrigger.type} trigger`,
          affectedPlanIds: [activePlan.planId],
          affectedFiles: [],
          triggerUsed: effectiveTrigger.type,
        },
        postState: {
          activePlanId: activePlan.planId,
          activePhaseId: activePlan.phases[activePlan.currentPhaseIndex]?.phaseId ?? null,
          checklistState: { checklistId: activePlan.checklistId, items: [], version: 0 },
          filesModified: [],
          newArtifacts: [],
          resolvedDecisions: [],
          pendingDecisions: [],
        },
        reasoning: {
          summary: `Orchestrated task with ${effectiveTrigger.type} trigger`,
          keyAssumptions: [],
          risksConsidered: [],
          alternativesRejected: [],
          confidence: 0.9,
        },
        causalLink: {
          previousRecordId: null,
          linkType: 'continues',
          deltaDescription: 'Orchestrator execution',
          diffHash: '0000',
        },
        planContext: {
          planId: activePlan.planId,
          planType: activePlan.planType,
          phaseId: activePlan.phases[activePlan.currentPhaseIndex]?.phaseId ?? null,
          parentPlanId: activePlan.parentPlanId ?? null,
          parentPhaseId: activePlan.parentPhaseId ?? null,
          depth: activePlan.depth,
        },
        tags: ['orchestrate', effectiveTrigger.type],
        tokensConsumed: 0,
      });
    } catch {
      // Recording is best-effort
    }
  }
}

main().catch((err) => {
  console.error('Orchestration failed:', err);
  process.exit(1);
});
