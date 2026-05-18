/**
 * Anti-Drift v2.0 — Plan Graph
 * DAG for Main Plans + Side Plans with cycle detection
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { PlanGraph, PlanNode, PlanPhase, PlanEdge } from './types.js';
import { PLAN_GRAPH_PATH, MAX_DEPTH, generateId, nowIso } from './types.js';

function getPlanGraphPath(): string {
  return PLAN_GRAPH_PATH();
}

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Create a new empty plan graph.
 */
export function createPlanGraph(): PlanGraph {
  return {
    version: 1,
    lastUpdated: nowIso(),
    nodes: {},
    edges: [],
    rootPlanIds: [],
    activePlanId: null,
  };
}

/**
 * Load plan graph from disk.
 */
export function loadPlanGraph(): PlanGraph {
  const path = getPlanGraphPath();
  if (!existsSync(path)) {
    return createPlanGraph();
  }
  try {
    const content = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(content) as PlanGraph;
    // Validate basic structure
    if (!parsed.nodes || !parsed.edges || !Array.isArray(parsed.rootPlanIds)) {
      return createPlanGraph();
    }
    return parsed;
  } catch {
    return createPlanGraph();
  }
}

/**
 * Save plan graph to disk.
 */
export function savePlanGraph(graph: PlanGraph): void {
  const path = getPlanGraphPath();
  ensureDir(path);
  graph.lastUpdated = nowIso();
  graph.version++;
  writeFileSync(path, JSON.stringify(graph, null, 2));
}

/**
 * Create a new main plan.
 */
export function createPlan(
  graph: PlanGraph,
  plan: Omit<PlanNode, 'planId'>
): PlanNode {
  const planId = generateId();
  const newPlan: PlanNode = {
    ...plan,
    planId,
    status: plan.status ?? 'draft',
    depth: plan.depth ?? 0,
    phases: plan.phases ?? [],
    currentPhaseIndex: plan.currentPhaseIndex ?? 0,
    checklistId: plan.checklistId ?? `chk-${planId}`,
    tags: plan.tags ?? [],
    estimatedTurns: plan.estimatedTurns ?? 0,
    actualTurns: plan.actualTurns ?? 0,
    createdAt: plan.createdAt ?? nowIso(),
  };

  graph.nodes[planId] = newPlan;
  if (newPlan.depth === 0) {
    graph.rootPlanIds.push(planId);
  }
  if (newPlan.status === 'active') {
    graph.activePlanId = planId;
  }

  return newPlan;
}

/**
 * Spawn a side plan from a parent plan's phase.
 */
export function spawnSidePlan(
  graph: PlanGraph,
  parentPlanId: string,
  parentPhaseId: string,
  plan: Omit<PlanNode, 'planId' | 'parentPlanId' | 'parentPhaseId' | 'depth'>
): PlanNode {
  const parent = graph.nodes[parentPlanId];
  if (!parent) {
    throw new Error(`Parent plan ${parentPlanId} not found`);
  }

  const newDepth = parent.depth + 1;
  if (newDepth > MAX_DEPTH) {
    throw new Error(
      `Cannot spawn side plan: depth ${newDepth} exceeds maximum ${MAX_DEPTH}`
    );
  }

  const planId = generateId();
  const sidePlan: PlanNode = {
    ...plan,
    planId,
    planType: 'side',
    status: 'active',
    parentPlanId,
    parentPhaseId,
    depth: newDepth,
    phases: plan.phases ?? [],
    currentPhaseIndex: plan.currentPhaseIndex ?? 0,
    checklistId: plan.checklistId ?? `chk-${planId}`,
    tags: plan.tags ?? [],
    estimatedTurns: plan.estimatedTurns ?? 0,
    actualTurns: 0,
    createdAt: nowIso(),
  };

  // Cycle detection
  if (!validateNoCycles(graph, parentPlanId, planId)) {
    throw new Error(
      `Cannot spawn side plan: would create a cycle in the plan graph`
    );
  }

  graph.nodes[planId] = sidePlan;

  // Add edge
  graph.edges.push({
    fromPlanId: parentPlanId,
    toPlanId: planId,
    edgeType: 'spawns',
    fromPhaseId: parentPhaseId,
    createdAt: nowIso(),
  });

  // Suspend parent and block phase
  parent.status = 'suspended';
  const phase = parent.phases.find((p) => p.phaseId === parentPhaseId);
  if (phase) {
    phase.status = 'blocked';
    phase.spawnedSidePlanIds.push(planId);
  }

  // Activate side plan
  graph.activePlanId = planId;

  return sidePlan;
}

/**
 * Mark a plan as completed.
 */
export function completePlan(graph: PlanGraph, planId: string): void {
  const plan = graph.nodes[planId];
  if (!plan) return;

  plan.status = 'completed';
  plan.completedAt = nowIso();

  // If this is a side plan, check if parent can resume
  if (plan.planType === 'side' && plan.parentPlanId) {
    returnFromSidePlan(graph, planId);
  }
}

/**
 * Mark a plan as abandoned.
 */
export function abandonPlan(graph: PlanGraph, planId: string): void {
  const plan = graph.nodes[planId];
  if (!plan) return;

  plan.status = 'abandoned';
  plan.completedAt = nowIso();

  // Resume parent if applicable
  if (plan.planType === 'side' && plan.parentPlanId) {
    resumeParentIfAllSidesDone(graph, plan.parentPlanId);
  }

  // If this was the active plan, clear it
  if (graph.activePlanId === planId) {
    graph.activePlanId = null;
  }
}

/**
 * Return from a side plan to its parent.
 */
export function returnFromSidePlan(graph: PlanGraph, sidePlanId: string): void {
  const sidePlan = graph.nodes[sidePlanId];
  if (!sidePlan || sidePlan.planType !== 'side') return;

  sidePlan.status = 'completed';
  sidePlan.completedAt = nowIso();

  // Add return edge
  if (sidePlan.parentPlanId) {
    graph.edges.push({
      fromPlanId: sidePlanId,
      toPlanId: sidePlan.parentPlanId,
      edgeType: 'returns-to',
      toPhaseId: sidePlan.parentPhaseId,
      createdAt: nowIso(),
    });

    resumeParentIfAllSidesDone(graph, sidePlan.parentPlanId);
  }
}

/**
 * Resume parent plan if all its side plans are done or abandoned.
 */
function resumeParentIfAllSidesDone(graph: PlanGraph, parentPlanId: string): void {
  const parent = graph.nodes[parentPlanId];
  if (!parent) return;

  // Check all spawned side plans for this parent
  const allSidePlanIds = parent.phases.flatMap((p) => p.spawnedSidePlanIds);
  const allDone = allSidePlanIds.every((id) => {
    const side = graph.nodes[id];
    return side && (side.status === 'completed' || side.status === 'abandoned');
  });

  if (allDone && allSidePlanIds.length > 0) {
    parent.status = 'active';
    graph.activePlanId = parentPlanId;

    // Unblock the current phase
    const currentPhase = parent.phases[parent.currentPhaseIndex];
    if (currentPhase && currentPhase.status === 'blocked') {
      currentPhase.status = 'active';
    }
  }
}

/**
 * Advance to the next phase in a plan.
 */
export function advancePhase(graph: PlanGraph, planId: string): void {
  const plan = graph.nodes[planId];
  if (!plan) return;

  // Mark current phase completed
  const currentPhase = plan.phases[plan.currentPhaseIndex];
  if (currentPhase) {
    currentPhase.status = 'completed';
  }

  // Move to next phase
  plan.currentPhaseIndex++;
  const nextPhase = plan.phases[plan.currentPhaseIndex];
  if (nextPhase) {
    nextPhase.status = 'active';
  } else {
    // All phases done
    completePlan(graph, planId);
  }
}

/**
 * Get the currently active plan.
 */
export function getActivePlan(graph: PlanGraph): PlanNode | null {
  if (!graph.activePlanId) return null;
  return graph.nodes[graph.activePlanId] ?? null;
}

/**
 * Get the ancestor chain for a plan (for cycle detection).
 */
export function getPlanChain(graph: PlanGraph, planId: string): PlanNode[] {
  const chain: PlanNode[] = [];
  let current = graph.nodes[planId];

  while (current) {
    chain.push(current);
    if (!current.parentPlanId) break;
    current = graph.nodes[current.parentPlanId];
  }

  return chain;
}

/**
 * Validate that adding an edge from→to would not create a cycle.
 */
export function validateNoCycles(
  graph: PlanGraph,
  fromPlanId: string,
  toPlanId: string
): boolean {
  // Prevent self-loops
  if (fromPlanId === toPlanId) return false;

  // Check depth limit
  const fromPlan = graph.nodes[fromPlanId];
  if (fromPlan && fromPlan.depth >= MAX_DEPTH) return false;

  // Check if toPlanId is already an ancestor of fromPlanId
  const chain = getPlanChain(graph, fromPlanId);
  const ancestorIds = new Set(chain.map((p) => p.planId));
  if (ancestorIds.has(toPlanId)) return false;

  return true;
}
