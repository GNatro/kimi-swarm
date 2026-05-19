#!/usr/bin/env tsx
/**
 * Swarm Orchestrate — One-shot CLI with Elite Trigger + Auto-Detection support
 * Usage: npx tsx bin/swarm-orchestrate.ts "[APPROVED]"
 *        npx tsx bin/swarm-orchestrate.ts "plan only: Implement feature X"
 *        npx tsx bin/swarm-orchestrate.ts "Implement feature X"  (auto-detected)
 */

import { orchestrate } from '../src/index.js';
import { loadPending, clearPending } from '../src/trigger-pending.js';
import { autoOrchestrate } from '../src/auto-orchestrate.js';

const request = process.argv.slice(2).join(' ');

if (!request) {
  console.error('Usage: npx tsx bin/swarm-orchestrate.ts "<your task>"');
  process.exit(1);
}

async function main() {
  const role = process.env.ELITE_ROLE || 'orchestrator';

  // Use autoOrchestrate as the canonical entry point
  const result = await autoOrchestrate(request, role as 'orchestrator' | 'worker');

  console.log(`\n🐝 Mode: ${result.mode}`);
  console.log(`📝 Action: ${result.action}`);

  // Execute based on mode (reuse existing functions)
  switch (result.mode) {
    case 'plan-only': {
      const { brief, prompts } = await orchestrate(result.context || request, { dryRun: true });
      console.log('\n⏸️  PLAN ONLY — Task NOT written to bus');
      console.log(`   Workers: ${prompts.length}`);
      console.log(`   Risk Score: ${brief.riskScore || 'N/A'}`);
      return { brief, prompts, dryRun: true };
    }
    case 'approved': {
      const pending = loadPending();
      if (!pending || pending.status !== 'pending') {
        console.error('❌ No pending plan to approve');
        process.exit(1);
      }
      const { brief, prompts } = await orchestrate(pending.request, { approved: true });
      console.log('\n✅ APPROVED — Executing plan');
      return { brief, prompts };
    }
    case 'reject': {
      clearPending();
      console.log('\n❌ REJECTED — Pending plan cleared');
      return { rejected: true };
    }
    case 'challenge': {
      const subject = request.replace(/^challenge:\s*/, '').trim() || 'current plan';
      const { runChallenge } = await import('../src/challenge-engine.js');
      const challengeResult = await runChallenge(subject);
      console.log('\n🎯 CHALLENGE COMPLETE');
      console.log(challengeResult);
      return { challenge: challengeResult };
    }
    case 'light': {
      const { runLightChecks } = await import('../src/trigger-light.js');
      const checks = await runLightChecks(process.cwd());
      console.log('\n⚡ LIGHT MODE');
      console.log('Checks:', checks);
      return { light: true, checks };
    }
    case 'audit': {
      console.log('\n🔍 Running audit...');
      return { audit: true };
    }
    default: {
      // Normal mode — auto-detected
      const { brief, prompts } = await orchestrate(request);
      console.log(`\n🐝 Orchestrated: ${prompts.length} workers`);
      return { brief, prompts };
    }
  }
}

main().catch((err) => {
  console.error('Orchestration failed:', err);
  process.exit(1);
});
