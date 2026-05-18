/**
 * Auto-Orchestrate — Main automation module
 * This is called automatically by the agent file on every turn
 */

import { parseTrigger } from './trigger-router.js';
import { runAutoDetection } from './auto-trigger/router.js';
import { getSessionContext, recordUserPrompt } from './agent-integration.js';

export async function autoOrchestrate(
  userRequest: string,
  role: 'orchestrator' | 'worker'
): Promise<{
  mode: string;
  action: string;
  context: string;
}> {
  // 1. Record the prompt
  recordUserPrompt(userRequest, role);

  // 2. Get session context (re-read)
  const context = getSessionContext();

  // 3. Parse triggers
  const trigger = parseTrigger(userRequest);

  // 4. If no trigger, run auto-detection
  let effectiveTrigger = trigger;
  if (trigger.type === 'none') {
    const autoResult = await runAutoDetection(userRequest);
    effectiveTrigger = {
      type: autoResult.mode as any,
      cleanRequest: userRequest,
    };
  }

  // 5. Return orchestration result
  return {
    mode: effectiveTrigger.type,
    action: determineAction(effectiveTrigger, role),
    context,
  };
}

function determineAction(trigger: { type: string }, role: string): string {
  if (role === 'orchestrator') {
    switch (trigger.type) {
      case 'plan-only':
        return 'Create dry-run plan, show to user, wait for APPROVED';
      case 'approved':
        return 'Execute pending plan, delegate to workers';
      case 'reject':
        return 'Clear pending, ask user for new plan';
      case 'light':
        return 'Skip swarm, execute directly with V1+V3+V5 checks';
      case 'challenge':
        return 'Run 6-Lens review, no execution';
      case 'audit':
        return 'Self-audit last 10 turns vs L1-L7';
      default:
        return 'Auto-detect mode and proceed';
    }
  } else {
    return 'Wait for WORK ORDER from Orchestrator';
  }
}
