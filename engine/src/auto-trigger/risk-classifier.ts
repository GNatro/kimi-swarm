/**
 * Risk + Complexity Classifier
 * Calculates P×I (Probability × Impact) and complexity scores
 */

import type { ScopeResult } from './scope-estimator.js';

export interface RiskResult {
  probability: number;     // 1-5
  impact: number;          // 1-5
  riskScore: number;       // 1-25
  riskFactors: string[];
  isHighRisk: boolean;     // riskScore >= 13
}

export interface ComplexityResult {
  complexityScore: number;   // 1-10
  estimatedMinutes: number;
  isTrivial: boolean;        // complexityScore <= 2
  isSimple: boolean;         // complexityScore <= 4
  isComplex: boolean;        // complexityScore >= 7
}

export interface RiskComplexityInput {
  rawRequest: string;
  taskType: string;
  keywords: string[];
  scope: ScopeResult;
  isProduction?: boolean;
}

export interface RiskComplexityResult {
  risk: RiskResult;
  complexity: ComplexityResult;
}

/**
 * Calculate both risk and complexity in one pass
 */
export function calculateRiskAndComplexity(input: RiskComplexityInput): RiskComplexityResult {
  const risk = calculateRisk(input);
  const complexity = calculateComplexity(input);
  return { risk, complexity };
}

function calculateRisk(input: RiskComplexityInput): RiskResult {
  const { taskType, keywords, scope, isProduction = false } = input;

  const probability = calculateProbability(taskType, scope.estimatedFiles.avg, keywords);
  const impact = calculateImpact(keywords, isProduction, taskType);
  const riskScore = probability * impact;

  const riskFactors: string[] = [];
  if (taskType === 'refactor') riskFactors.push('Refactoring has broad impact');
  if (taskType === 'security') riskFactors.push('Security changes are high-stakes');
  if (scope.estimatedFiles.avg > 10) riskFactors.push('Large number of files touched');
  if (scope.estimatedServices > 2) riskFactors.push('Cross-service changes');
  if (isProduction) riskFactors.push('Production environment');
  if (keywords.some(k => ['auth', 'login', 'password'].includes(k))) {
    riskFactors.push('Authentication-related changes');
  }

  return {
    probability,
    impact,
    riskScore,
    riskFactors,
    isHighRisk: riskScore >= 13,
  };
}

function calculateProbability(taskType: string, estimatedFiles: number, keywords: string[]): number {
  let score = 2; // base
  if (taskType === 'refactor') score += 1;
  if (taskType === 'security') score += 1;
  if (keywords.some(k => ['auth', 'login', 'password', 'security'].includes(k))) score += 1;
  if (estimatedFiles > 10) score += 1;
  if (estimatedFiles > 5) score += 1;
  return Math.min(5, score);
}

function calculateImpact(
  keywords: string[],
  isProduction: boolean,
  taskType: string
): number {
  let score = 2; // base
  // Auth keywords: full weight for security/feature, reduced for bug-fix/typo
  if (keywords.some(k => ['auth', 'login', 'password'].includes(k))) {
    score += taskType === 'security' || taskType === 'feature' ? 3 : 2;
  }
  if (keywords.some(k => ['payment', 'billing'].includes(k))) score += 3;
  if (keywords.some(k => ['database', 'schema'].includes(k))) score += 2;
  if (isProduction) score += 2;
  return Math.min(5, score);
}

function calculateComplexity(input: RiskComplexityInput): ComplexityResult {
  const { rawRequest, scope } = input;
  const estimatedFiles = scope.estimatedFiles.avg;

  let score = 5; // base

  if (rawRequest.length < 50) score -= 2;
  if (rawRequest.length > 200) score += 2;
  if (estimatedFiles === 1) score -= 2;
  if (estimatedFiles > 5) score += 2;

  // Additional heuristics from research
  const lower = rawRequest.toLowerCase();
  if (lower.includes('typo') || lower.includes('spelling') || lower.includes('readme')) score -= 3;
  if (lower.includes(' and ') || lower.includes(' also ') || lower.includes(' plus ')) score += 2;
  if (lower.includes(' all ') || lower.includes(' every ') || lower.includes(' entire ')) score += 3;
  if (lower.includes(' just ') || lower.includes(' simply ') || lower.includes(' only ')) score += 1;

  score = Math.min(10, Math.max(1, score));

  // Estimate minutes
  let estimatedMinutes = estimatedFiles * 5; // ~5 min per file
  if (score <= 2) estimatedMinutes = Math.min(estimatedMinutes, 2);
  if (score >= 7) estimatedMinutes = Math.max(estimatedMinutes, 30);

  return {
    complexityScore: score,
    estimatedMinutes,
    isTrivial: score <= 2 && estimatedFiles <= 1 && estimatedMinutes <= 2,
    isSimple: score <= 4,
    isComplex: score >= 7,
  };
}
