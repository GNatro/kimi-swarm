/**
 * Auto-Trigger Router — Decision tree for automatic trigger selection
 */

import { classifyIntent } from './classifier.js';
import { estimateScope } from './scope-estimator.js';
import { calculateRiskAndComplexity } from './risk-classifier.js';
import { buildProjectMap } from '../indexer/index.js';
import { getProject } from '../project/registry.js';
import { appendRecord, hashPrompt } from '../anti-drift/causal-registry.js';
import { nowIso } from '../anti-drift/types.js';

export type AutoMode = 'light' | 'plan-only' | 'challenge' | 'normal';

export interface AutoDecision {
  mode: AutoMode;
  reason: string;
  confidence: number;
  explanation: string;
  taskType: string;
  riskScore: number;
  complexityScore: number;
  estimatedFiles: number;
  estimatedMinutes: number;
}

/**
 * Run auto-detection pipeline on a user request
 */
export async function runAutoDetection(
  rawRequest: string,
  projectId?: string
): Promise<AutoDecision> {
  // Step 1: Classify intent
  const intent = classifyIntent(rawRequest);

  // Step 2: Load project map (if available)
  let projectMap: Awaited<ReturnType<typeof buildProjectMap>> | null = null;
  if (projectId) {
    try {
      const proj = getProject(projectId);
      if (proj) {
        projectMap = await buildProjectMap(projectId);
      }
    } catch {
      // Project map not available, use heuristics only
    }
  }

  // Step 3: Estimate scope
  const scope = estimateScope({
    taskType: intent.taskType,
    keywords: intent.keywords,
    projectMap,
  });

  // Step 4: Calculate risk + complexity
  const { risk, complexity } = calculateRiskAndComplexity({
    rawRequest,
    taskType: intent.taskType,
    keywords: intent.keywords,
    scope,
    isProduction: false,
  });

  // Step 5: Decision tree
  const decision = makeDecision(intent.taskType, risk, complexity, scope, rawRequest);

  // Anti-Drift v2.0: Record auto-trigger decision
  try {
    appendRecord({
      recordId: `rec-auto-${Date.now()}`,
      turnNumber: 0, // Will be updated by orchestrator
      timestamp: nowIso(),
      userPrompt: rawRequest,
      userPromptHash: hashPrompt(rawRequest),
      preState: {
        activePlanId: null,
        activePhaseId: null,
        checklistState: { checklistId: 'chk-empty', items: [], version: 0 },
        filesModified: [],
        pendingDecisions: [],
      },
      decision: {
        type: decision.mode === 'light' ? 'modify-file' :
              decision.mode === 'plan-only' ? 'create-plan' :
              decision.mode === 'challenge' ? 'ask-clarification' : 'continue-plan',
        description: decision.explanation,
        affectedPlanIds: [],
        affectedFiles: [],
        triggerUsed: `auto-${decision.mode}`,
      },
      postState: {
        activePlanId: null,
        activePhaseId: null,
        checklistState: { checklistId: 'chk-empty', items: [], version: 0 },
        filesModified: [],
        newArtifacts: [],
        resolvedDecisions: [],
        pendingDecisions: [],
      },
      reasoning: {
        summary: decision.reason,
        keyAssumptions: [`Task type: ${intent.taskType}`],
        risksConsidered: [`Risk score: ${risk.riskScore}`],
        alternativesRejected: [],
        confidence: decision.confidence,
      },
      causalLink: {
        previousRecordId: null,
        linkType: 'continues',
        deltaDescription: 'Auto-detected trigger',
        diffHash: '0000',
      },
      planContext: {
        planId: null,
        planType: null,
        phaseId: null,
        parentPlanId: null,
        parentPhaseId: null,
        depth: 0,
      },
      tags: ['auto-detected', intent.taskType, decision.mode],
      tokensConsumed: 0,
    });
  } catch {
    // Silently fail — recording is best-effort
  }

  return {
    ...decision,
    taskType: intent.taskType,
    riskScore: risk.riskScore,
    complexityScore: complexity.complexityScore,
    estimatedFiles: scope.estimatedFiles.avg,
    estimatedMinutes: complexity.estimatedMinutes,
  };
}

function makeDecision(
  taskType: string,
  risk: { riskScore: number; isHighRisk: boolean },
  complexity: { isTrivial: boolean; complexityScore: number },
  scope: { estimatedFiles: { avg: number }; estimatedServices: number },
  rawRequest: string
): { mode: AutoMode; reason: string; confidence: number; explanation: string } {
  // 1. Exploration → normal mode (read-only)
  if (taskType === 'exploration') {
    return {
      mode: 'normal',
      reason: 'Exploration tasks are read-only',
      confidence: 0.9,
      explanation: '🔍 Exploration detected. Running in normal mode (read-only analysis).',
    };
  }

  // 2. Trivial task → light mode
  if (complexity.isTrivial && scope.estimatedFiles.avg <= 1) {
    return {
      mode: 'light',
      reason: 'Trivial task (<2 min, 1 file)',
      confidence: 0.85,
      explanation: `⚡ Auto-detected trivial task. Using light mode.\n   Task: "${rawRequest}" | Estimated: <2 min | Files: 1\n   Say 'plan only:' to see full plan instead.`,
    };
  }

  // 3. High risk → challenge + plan-only
  if (risk.isHighRisk) {
    return {
      mode: 'challenge',
      reason: `High risk detected (P×I = ${risk.riskScore})`,
      confidence: 0.8,
      explanation: `🔍 High risk detected (P×I = ${risk.riskScore}). Running challenge review first.\n   After review, plan-only mode will be used for execution.`,
    };
  }

  // 4. Multi-file/service → plan-only
  if (scope.estimatedFiles.avg > 3 || scope.estimatedServices > 1) {
    return {
      mode: 'plan-only',
      reason: `Multi-file task (${scope.estimatedFiles.avg} files, ${scope.estimatedServices} services)`,
      confidence: 0.75,
      explanation: `📋 Multi-file task detected. Using plan-only mode.\n   Estimated: ${scope.estimatedFiles.avg} files, ${scope.estimatedServices} service(s).\n   Review the plan and say [APPROVED] to execute.`,
    };
  }

  // 5. Default → normal mode
  return {
    mode: 'normal',
    reason: 'Single-file or simple task',
    confidence: 0.6,
    explanation: `🚀 Single-file task detected. Normal execution.\n   Estimated: ${scope.estimatedFiles.avg} file(s).`,
  };
}
