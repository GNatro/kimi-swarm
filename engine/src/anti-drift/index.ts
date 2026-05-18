/**
 * Anti-Drift v2.0 — Public API
 * Causal memory + plan graph system
 */

// ── Types ──
export type {
  CausalRecord,
  PreState,
  PostState,
  Decision,
  ReasoningBlock,
  CausalLink,
  PlanContext,
  ChecklistSnapshot,
  PlanNode,
  PlanPhase,
  PlanEdge,
  PlanGraph,
  LiveChecklist,
  ChecklistItem,
  RollupRecord,
  AntiDriftCompactState,
  DecisionType,
  CausalLinkType,
  PlanType,
  PlanStatus,
  PhaseStatus,
  EdgeType,
  ChecklistItemStatus,
  ItemAddedBy,
} from './types.js';

// ── Type Guards ──
export {
  isValidDecisionType,
  isValidCausalLinkType,
  isValidPlanType,
  isValidPlanStatus,
  isValidPhaseStatus,
  isValidEdgeType,
  isValidChecklistItemStatus,
  isValidItemAddedBy,
  generateId,
  hashString,
  nowIso,
  MAX_DEPTH,
  MAX_CHECKLIST_ITEMS,
  ROLLUP_INTERVAL,
  BUDGET_TOKENS,
  SIDE_PLAN_TIMEOUT_TURNS,
} from './types.js';

// ── Causal Registry ──
export {
  appendRecord,
  getLastNRecords,
  getRecordsForPlan,
  getRecordById,
  searchRecordsByTag,
  getTotalRecordCount,
  truncatePrompt,
  hashPrompt,
} from './causal-registry.js';

// ── Plan Graph ──
export {
  createPlanGraph,
  loadPlanGraph,
  savePlanGraph,
  createPlan,
  spawnSidePlan,
  completePlan,
  abandonPlan,
  returnFromSidePlan,
  advancePhase,
  getActivePlan,
  getPlanChain,
  validateNoCycles,
} from './plan-graph.js';

// ── Checklist Manager ──
export {
  createChecklist,
  loadChecklist,
  saveChecklist,
  addItem,
  markDone,
  markSkipped,
  inheritChecklist,
  syncChecklistOnReturn,
  archiveOldItems,
  suggestMarkDone,
} from './checklist-manager.js';

// ── Re-Reader ──
export {
  reReadContext,
  serializeRecordFull,
  serializeRecordBrief,
  serializeRecordUltraBrief,
  serializePlan,
  estimateTokens,
  generateRollup,
} from './re-reader.js';

// ── Rollup Generator ──
export {
  generateRollupRecord,
  saveRollup,
  loadRollup,
  getLatestRollup,
  shouldGenerateRollup,
  autoGenerateRollup,
} from './rollup-generator.js';
