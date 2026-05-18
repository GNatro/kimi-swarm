/**
 * Agent Integration — Bridge between Kimi agent file and Anti-Drift engine
 * Called automatically by the agent file system prompt
 */

import { loadPlanGraph, getActivePlan, createPlanGraph } from './anti-drift/plan-graph.js';
import { appendRecord, hashPrompt } from './anti-drift/causal-registry.js';
import { reReadContext } from './anti-drift/re-reader.js';

export function getSessionContext(): string {
  const graph = loadPlanGraph();
  if (!graph || !graph.activePlanId) {
    return 'No active plan. Ready to create new plan.';
  }

  const activePlan = getActivePlan(graph);
  if (!activePlan) {
    return 'Plan graph exists but no active plan.';
  }

  const turnCount = parseInt(process.env.TURN_COUNT || '0');
  return reReadContext(turnCount, activePlan.planId);
}

export function recordUserPrompt(prompt: string, role: 'orchestrator' | 'worker'): void {
  const graph = loadPlanGraph() || createPlanGraph();
  const activePlan = getActivePlan(graph);

  appendRecord({
    recordId: `rec-${Date.now()}`,
    turnNumber: parseInt(process.env.TURN_COUNT || '0'),
    timestamp: new Date().toISOString(),
    userPrompt: prompt,
    userPromptHash: hashPrompt(prompt),
    preState: {
      activePlanId: activePlan?.planId || null,
      activePhaseId: activePlan?.phases[activePlan?.currentPhaseIndex || 0]?.phaseId || null,
      checklistState: { checklistId: '', items: [], version: 0 },
      filesModified: [],
      pendingDecisions: [],
    },
    decision: {
      type: 'continue-plan',
      description: `User prompt received by ${role}`,
      affectedPlanIds: activePlan ? [activePlan.planId] : [],
      affectedFiles: [],
    },
    postState: {
      activePlanId: activePlan?.planId || null,
      activePhaseId: activePlan?.phases[activePlan?.currentPhaseIndex || 0]?.phaseId || null,
      checklistState: { checklistId: '', items: [], version: 0 },
      filesModified: [],
      newArtifacts: [],
      resolvedDecisions: [],
      pendingDecisions: [],
    },
    reasoning: {
      summary: `Recorded user prompt in ${role} mode`,
      keyAssumptions: [],
      risksConsidered: [],
      alternativesRejected: [],
      confidence: 0.9,
    },
    causalLink: {
      previousRecordId: null,
      linkType: 'continues',
      deltaDescription: 'User prompt recorded',
      diffHash: '0000',
    },
    planContext: {
      planId: activePlan?.planId || null,
      planType: activePlan?.planType || null,
      phaseId: activePlan?.phases[activePlan?.currentPhaseIndex || 0]?.phaseId || null,
      parentPlanId: null,
      parentPhaseId: null,
      depth: 0,
    },
    tags: ['auto-recorded', role],
    tokensConsumed: 0,
  });
}
