/**
 * Auto-Trigger Router — Decision tree for automatic trigger selection
 */

import { classifyIntent } from './classifier.js';
import { estimateScope } from './scope-estimator.js';
import { calculateRiskAndComplexity } from './risk-classifier.js';
import { buildProjectMap } from '../indexer/index.js';
import { getProject } from '../project/registry.js';

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
