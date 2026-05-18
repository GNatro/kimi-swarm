/**
 * Auto-Trigger System v1.1 — Automatic trigger detection for Elite Triggers
 */

export { classifyIntent, type IntentResult, type TaskType } from './classifier.js';
export { estimateScope, type ScopeResult } from './scope-estimator.js';
export {
  calculateRiskAndComplexity,
  type RiskResult,
  type ComplexityResult,
  type RiskComplexityInput,
  type RiskComplexityResult,
} from './risk-classifier.js';
export { runAutoDetection, type AutoDecision, type AutoMode } from './router.js';
