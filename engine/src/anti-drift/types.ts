/**
 * Anti-Drift v2.0 — Core Types
 * Causal memory + plan graph system
 */

import { createHash, randomUUID } from 'crypto';
import os from 'os';

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════

export const MAX_DEPTH = 3;
export const MAX_CHECKLIST_ITEMS = 20;
export const ROLLUP_INTERVAL = 10;
export const BUDGET_TOKENS = 30000;
export const SIDE_PLAN_TIMEOUT_TURNS = 20;
export const PROMPT_TRUNCATE_BYTES = 10240; // 10KB
export const REASONING_TRUNCATE_BYTES = 2048; // 2KB
export const TOKEN_ESTIMATE_RATIO = 4; // ~4 chars per token

// ═══════════════════════════════════════════════════════════════
//  PATHS (lazy evaluation for testability)
// ═══════════════════════════════════════════════════════════════

function getStateDir(): string {
  return `${process.env.HOME || os.homedir() || '/tmp'}/.kimi/state`;
}

export const CAUSAL_REGISTRY_PATH = () => `${getStateDir()}/causal-registry.jsonl`;
export const PLAN_GRAPH_PATH = () => `${getStateDir()}/plan-graph-index.json`;
export const CHECKLISTS_DIR = () => `${getStateDir()}/checklists`;
export const ROLLUPS_DIR = () => `${getStateDir()}/rollups`;
export const COMPACT_STATE_PATH = () => `${process.env.HOME || os.homedir() || '/tmp'}/.kimi/memory/sessions/active/anti-drift-compact-state.json`;

// ═══════════════════════════════════════════════════════════════
//  DECISION TYPES
// ═══════════════════════════════════════════════════════════════

export const DECISION_TYPES = [
  'create-plan',
  'continue-plan',
  'spawn-side-plan',
  'return-from-side',
  'modify-file',
  'run-command',
  'ask-clarification',
  'no-op',
] as const;

export type DecisionType = (typeof DECISION_TYPES)[number];

export const CAUSAL_LINK_TYPES = [
  'continues',
  'contradicts',
  'refines',
  'spawns',
  'returns',
  'abandons',
] as const;

export type CausalLinkType = (typeof CAUSAL_LINK_TYPES)[number];

export const PLAN_TYPES = ['main', 'side'] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

export const PLAN_STATUSES = [
  'draft',
  'active',
  'suspended',
  'completed',
  'abandoned',
] as const;

export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PHASE_STATUSES = [
  'pending',
  'active',
  'completed',
  'blocked',
  'skipped',
] as const;

export type PhaseStatus = (typeof PHASE_STATUSES)[number];

export const EDGE_TYPES = ['spawns', 'returns-to', 'depends-on'] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export const CHECKLIST_ITEM_STATUSES = [
  'pending',
  'in-progress',
  'done',
  'skipped',
  'blocked',
] as const;

export type ChecklistItemStatus = (typeof CHECKLIST_ITEM_STATUSES)[number];

export const ITEM_ADDED_BY = ['user', 'ai', 'side-plan', 'auto'] as const;
export type ItemAddedBy = (typeof ITEM_ADDED_BY)[number];

// ═══════════════════════════════════════════════════════════════
//  CORE: Causal Record System
// ═══════════════════════════════════════════════════════════════

export interface CausalRecord {
  recordId: string;
  turnNumber: number;
  timestamp: string;
  userPrompt: string;
  userPromptHash: string;
  preState: PreState;
  decision: Decision;
  postState: PostState;
  reasoning: ReasoningBlock;
  causalLink: CausalLink;
  planContext: PlanContext;
  tags: string[];
  tokensConsumed: number;
}

export interface PreState {
  activePlanId: string | null;
  activePhaseId: string | null;
  checklistState: ChecklistSnapshot;
  filesModified: string[];
  pendingDecisions: string[];
}

export interface Decision {
  type: DecisionType;
  description: string;
  affectedPlanIds: string[];
  affectedFiles: string[];
  triggerUsed?: string;
}

export interface PostState {
  activePlanId: string | null;
  activePhaseId: string | null;
  checklistState: ChecklistSnapshot;
  filesModified: string[];
  newArtifacts: string[];
  resolvedDecisions: string[];
  pendingDecisions: string[];
}

export interface ReasoningBlock {
  summary: string;
  keyAssumptions: string[];
  risksConsidered: string[];
  alternativesRejected: string[];
  confidence: number;
}

export interface CausalLink {
  previousRecordId: string | null;
  linkType: CausalLinkType;
  deltaDescription: string;
  diffHash: string;
}

export interface PlanContext {
  planId: string | null;
  planType: PlanType | null;
  phaseId: string | null;
  parentPlanId: string | null;
  parentPhaseId: string | null;
  depth: number;
}

export interface ChecklistSnapshot {
  checklistId: string;
  items: { id: string; text: string; status: string; doneAt?: string }[];
  version: number;
}

// ═══════════════════════════════════════════════════════════════
//  PLAN GRAPH
// ═══════════════════════════════════════════════════════════════

export interface PlanNode {
  planId: string;
  planType: PlanType;
  title: string;
  description: string;
  status: PlanStatus;
  createdAt: string;
  completedAt?: string;
  parentPlanId?: string;
  parentPhaseId?: string;
  depth: number;
  phases: PlanPhase[];
  currentPhaseIndex: number;
  checklistId: string;
  tags: string[];
  estimatedTurns: number;
  actualTurns: number;
}

export interface PlanPhase {
  phaseId: string;
  title: string;
  description: string;
  status: PhaseStatus;
  order: number;
  spawnedSidePlanIds: string[];
  recordIds: string[];
  entryCriteria: string[];
  exitCriteria: string[];
}

export interface PlanEdge {
  fromPlanId: string;
  toPlanId: string;
  edgeType: EdgeType;
  fromPhaseId?: string;
  toPhaseId?: string;
  createdAt: string;
}

export interface PlanGraph {
  version: number;
  lastUpdated: string;
  nodes: Record<string, PlanNode>;
  edges: PlanEdge[];
  rootPlanIds: string[];
  activePlanId: string | null;
}

// ═══════════════════════════════════════════════════════════════
//  LIVE CHECKLISTS
// ═══════════════════════════════════════════════════════════════

export interface LiveChecklist {
  checklistId: string;
  planId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  items: ChecklistItem[];
  inheritedFromChecklistId?: string;
  inheritedItemsFrozen: boolean;
}

export interface ChecklistItem {
  itemId: string;
  text: string;
  status: ChecklistItemStatus;
  createdAt: string;
  updatedAt: string;
  doneAt?: string;
  blockedReason?: string;
  addedBy: ItemAddedBy;
  relatedRecordIds: string[];
  relatedPlanIds: string[];
}

// ═══════════════════════════════════════════════════════════════
//  ROLLUP
// ═══════════════════════════════════════════════════════════════

export interface RollupRecord {
  rollupId: string;
  coversTurns: [number, number];
  summary: string;
  keyDecisions: string[];
  plansCreated: string[];
  plansCompleted: string[];
  filesModified: string[];
  unresolvedQuestions: string[];
}

// ═══════════════════════════════════════════════════════════════
//  COMPACT STATE (for context compaction survival)
// ═══════════════════════════════════════════════════════════════

export interface AntiDriftCompactState {
  planGraph: PlanGraph;
  activeChecklists: LiveChecklist[];
  latestRollup: RollupRecord | null;
  activePlanId: string | null;
  savedAt: string;
}

// ═══════════════════════════════════════════════════════════════
//  TYPE GUARDS
// ═══════════════════════════════════════════════════════════════

export function isValidDecisionType(x: unknown): x is DecisionType {
  return typeof x === 'string' && DECISION_TYPES.includes(x as DecisionType);
}

export function isValidCausalLinkType(x: unknown): x is CausalLinkType {
  return typeof x === 'string' && CAUSAL_LINK_TYPES.includes(x as CausalLinkType);
}

export function isValidPlanType(x: unknown): x is PlanType {
  return typeof x === 'string' && PLAN_TYPES.includes(x as PlanType);
}

export function isValidPlanStatus(x: unknown): x is PlanStatus {
  return typeof x === 'string' && PLAN_STATUSES.includes(x as PlanStatus);
}

export function isValidPhaseStatus(x: unknown): x is PhaseStatus {
  return typeof x === 'string' && PHASE_STATUSES.includes(x as PhaseStatus);
}

export function isValidEdgeType(x: unknown): x is EdgeType {
  return typeof x === 'string' && EDGE_TYPES.includes(x as EdgeType);
}

export function isValidChecklistItemStatus(x: unknown): x is ChecklistItemStatus {
  return typeof x === 'string' && CHECKLIST_ITEM_STATUSES.includes(x as ChecklistItemStatus);
}

export function isValidItemAddedBy(x: unknown): x is ItemAddedBy {
  return typeof x === 'string' && ITEM_ADDED_BY.includes(x as ItemAddedBy);
}

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

export function generateId(): string {
  return randomUUID();
}

export function hashString(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function nowIso(): string {
  return new Date().toISOString();
}
