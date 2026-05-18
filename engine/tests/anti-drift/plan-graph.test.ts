import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { PlanNode, PlanPhase, PlanGraph } from '../../src/anti-drift/types.js';
import {
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
} from '../../src/anti-drift/plan-graph.js';

const TEST_DIR = mkdtempSync(join(tmpdir(), 'anti-drift-pg-test-'));
process.env.HOME = TEST_DIR;

const { PLAN_GRAPH_PATH } = await import('../../src/anti-drift/types.js');

function makePhase(overrides?: Partial<PlanPhase>): PlanPhase {
  return {
    phaseId: `phase-${Math.random().toString(36).slice(2, 7)}`,
    title: 'Test Phase',
    description: 'A test phase',
    status: 'pending',
    order: 1,
    spawnedSidePlanIds: [],
    recordIds: [],
    entryCriteria: [],
    exitCriteria: [],
    ...overrides,
  };
}

function makePlan(overrides?: Partial<PlanNode>): PlanNode {
  return {
    planId: `plan-${Math.random().toString(36).slice(2, 7)}`,
    planType: 'main',
    title: 'Test Plan',
    description: 'A test plan',
    status: 'active',
    createdAt: new Date().toISOString(),
    depth: 0,
    phases: [makePhase({ status: 'active', order: 1 }), makePhase({ order: 2 })],
    currentPhaseIndex: 0,
    checklistId: `chk-${Math.random().toString(36).slice(2, 7)}`,
    tags: [],
    estimatedTurns: 10,
    actualTurns: 0,
    ...overrides,
  };
}

describe('plan-graph', () => {
  beforeEach(() => {
    try {
      rmSync(PLAN_GRAPH_PATH(), { force: true });
    } catch {
      // ignore
    }
  });

  it('createPlanGraph initializes empty', () => {
    const graph = createPlanGraph();
    expect(graph.nodes).toEqual({});
    expect(graph.edges).toEqual([]);
    expect(graph.rootPlanIds).toEqual([]);
    expect(graph.activePlanId).toBeNull();
  });

  it('createPlan adds node with depth 0', () => {
    const graph = createPlanGraph();
    const plan = createPlan(graph, makePlan());
    expect(graph.nodes[plan.planId]).toBeDefined();
    expect(plan.depth).toBe(0);
    expect(graph.rootPlanIds).toContain(plan.planId);
  });

  it('createPlan assigns UUID', () => {
    const graph = createPlanGraph();
    const plan = createPlan(graph, makePlan());
    expect(plan.planId).toBeDefined();
    expect(plan.planId.length).toBeGreaterThan(8);
  });

  it('spawnSidePlan adds node with depth 1', () => {
    const graph = createPlanGraph();
    const main = createPlan(graph, makePlan());
    const side = spawnSidePlan(graph, main.planId, main.phases[0].phaseId, makePlan({ planType: 'side' }));
    expect(side.depth).toBe(1);
    expect(side.parentPlanId).toBe(main.planId);
  });

  it('spawnSidePlan links parent', () => {
    const graph = createPlanGraph();
    const main = createPlan(graph, makePlan());
    const side = spawnSidePlan(graph, main.planId, main.phases[0].phaseId, makePlan({ planType: 'side' }));
    const edge = graph.edges.find((e) => e.toPlanId === side.planId);
    expect(edge).toBeDefined();
    expect(edge!.edgeType).toBe('spawns');
  });

  it('spawnSidePlan sets parent status to suspended', () => {
    const graph = createPlanGraph();
    const main = createPlan(graph, makePlan());
    spawnSidePlan(graph, main.planId, main.phases[0].phaseId, makePlan({ planType: 'side' }));
    expect(graph.nodes[main.planId].status).toBe('suspended');
  });

  it('spawnSidePlan blocks parent phase', () => {
    const graph = createPlanGraph();
    const main = createPlan(graph, makePlan());
    const phaseId = main.phases[0].phaseId;
    spawnSidePlan(graph, main.planId, phaseId, makePlan({ planType: 'side' }));
    expect(graph.nodes[main.planId].phases[0].status).toBe('blocked');
    expect(graph.nodes[main.planId].phases[0].spawnedSidePlanIds.length).toBe(1);
  });

  it('completePlan marks done', () => {
    const graph = createPlanGraph();
    const plan = createPlan(graph, makePlan());
    completePlan(graph, plan.planId);
    expect(graph.nodes[plan.planId].status).toBe('completed');
    expect(graph.nodes[plan.planId].completedAt).toBeDefined();
  });

  it('completePlan advances parent if all sides done', () => {
    const graph = createPlanGraph();
    const main = createPlan(graph, makePlan());
    const side = spawnSidePlan(graph, main.planId, main.phases[0].phaseId, makePlan({ planType: 'side' }));
    completePlan(graph, side.planId);
    expect(graph.nodes[main.planId].status).toBe('active');
    expect(graph.activePlanId).toBe(main.planId);
  });

  it('abandonPlan marks abandoned', () => {
    const graph = createPlanGraph();
    const plan = createPlan(graph, makePlan());
    abandonPlan(graph, plan.planId);
    expect(graph.nodes[plan.planId].status).toBe('abandoned');
  });

  it('abandonPlan resumes parent', () => {
    const graph = createPlanGraph();
    const main = createPlan(graph, makePlan());
    const side = spawnSidePlan(graph, main.planId, main.phases[0].phaseId, makePlan({ planType: 'side' }));
    abandonPlan(graph, side.planId);
    expect(graph.nodes[main.planId].status).toBe('active');
  });

  it('returnFromSidePlan resumes parent', () => {
    const graph = createPlanGraph();
    const main = createPlan(graph, makePlan());
    const side = spawnSidePlan(graph, main.planId, main.phases[0].phaseId, makePlan({ planType: 'side' }));
    returnFromSidePlan(graph, side.planId);
    expect(graph.nodes[main.planId].status).toBe('active');
    expect(graph.nodes[side.planId].status).toBe('completed');
  });

  it('returnFromSidePlan marks side completed', () => {
    const graph = createPlanGraph();
    const main = createPlan(graph, makePlan());
    const side = spawnSidePlan(graph, main.planId, main.phases[0].phaseId, makePlan({ planType: 'side' }));
    returnFromSidePlan(graph, side.planId);
    expect(graph.nodes[side.planId].status).toBe('completed');
  });

  it('advancePhase moves to next', () => {
    const graph = createPlanGraph();
    const plan = createPlan(graph, makePlan({
      phases: [
        makePhase({ status: 'active', order: 1 }),
        makePhase({ status: 'pending', order: 2 }),
      ],
    }));
    advancePhase(graph, plan.planId);
    expect(graph.nodes[plan.planId].phases[0].status).toBe('completed');
    expect(graph.nodes[plan.planId].phases[1].status).toBe('active');
    expect(graph.nodes[plan.planId].currentPhaseIndex).toBe(1);
  });

  it('advancePhase marks previous completed', () => {
    const graph = createPlanGraph();
    const plan = createPlan(graph, makePlan({
      phases: [
        makePhase({ status: 'active', order: 1 }),
        makePhase({ status: 'pending', order: 2 }),
      ],
    }));
    advancePhase(graph, plan.planId);
    expect(graph.nodes[plan.planId].phases[0].status).toBe('completed');
  });

  it('getActivePlan returns correct node', () => {
    const graph = createPlanGraph();
    const plan = createPlan(graph, makePlan());
    const active = getActivePlan(graph);
    expect(active).not.toBeNull();
    expect(active!.planId).toBe(plan.planId);
  });

  it('getPlanChain returns ancestors', () => {
    const graph = createPlanGraph();
    const main = createPlan(graph, makePlan());
    const side1 = spawnSidePlan(graph, main.planId, main.phases[0].phaseId, makePlan({ planType: 'side' }));
    const chain = getPlanChain(graph, side1.planId);
    expect(chain.length).toBe(2);
    expect(chain[0].planId).toBe(side1.planId);
    expect(chain[1].planId).toBe(main.planId);
  });

  it('validateNoCycles allows valid edge', () => {
    const graph = createPlanGraph();
    const a = createPlan(graph, makePlan());
    const b = createPlan(graph, makePlan());
    expect(validateNoCycles(graph, a.planId, b.planId)).toBe(true);
  });

  it('validateNoCycles rejects cycle', () => {
    const graph = createPlanGraph();
    const a = createPlan(graph, makePlan());
    const b = spawnSidePlan(graph, a.planId, a.phases[0].phaseId, makePlan({ planType: 'side' }));
    // b → a would create a cycle
    expect(validateNoCycles(graph, b.planId, a.planId)).toBe(false);
  });

  it('validateNoCycles rejects depth > 3', () => {
    const graph = createPlanGraph();
    const p0 = createPlan(graph, makePlan());
    const p1 = spawnSidePlan(graph, p0.planId, p0.phases[0].phaseId, makePlan({ planType: 'side' }));
    const p2 = spawnSidePlan(graph, p1.planId, p1.phases[0].phaseId, makePlan({ planType: 'side' }));
    const p3 = spawnSidePlan(graph, p2.planId, p2.phases[0].phaseId, makePlan({ planType: 'side' }));
    expect(p3.depth).toBe(3);
    // Trying to spawn from p3 (depth 3) should fail
    expect(validateNoCycles(graph, p3.planId, 'new-plan')).toBe(false);
  });

  it('Multiple side plans per parent', () => {
    const graph = createPlanGraph();
    const main = createPlan(graph, makePlan());
    const side1 = spawnSidePlan(graph, main.planId, main.phases[0].phaseId, makePlan({ planType: 'side', title: 'Side 1' }));
    const side2 = spawnSidePlan(graph, main.planId, main.phases[0].phaseId, makePlan({ planType: 'side', title: 'Side 2' }));
    expect(graph.nodes[main.planId].phases[0].spawnedSidePlanIds.length).toBe(2);
    expect(graph.nodes[main.planId].phases[0].spawnedSidePlanIds).toContain(side1.planId);
    expect(graph.nodes[main.planId].phases[0].spawnedSidePlanIds).toContain(side2.planId);
  });

  it('Parent suspends until ALL sides return', () => {
    const graph = createPlanGraph();
    const main = createPlan(graph, makePlan());
    const side1 = spawnSidePlan(graph, main.planId, main.phases[0].phaseId, makePlan({ planType: 'side' }));
    const side2 = spawnSidePlan(graph, main.planId, main.phases[0].phaseId, makePlan({ planType: 'side' }));
    returnFromSidePlan(graph, side1.planId);
    // Parent should still be suspended because side2 is not done
    expect(graph.nodes[main.planId].status).toBe('suspended');
    returnFromSidePlan(graph, side2.planId);
    // Now parent should be active
    expect(graph.nodes[main.planId].status).toBe('active');
  });

  it('Phase entry/exit criteria stored', () => {
    const graph = createPlanGraph();
    const plan = createPlan(graph, makePlan({
      phases: [makePhase({ entryCriteria: ['schema done'], exitCriteria: ['tests pass'] })],
    }));
    expect(graph.nodes[plan.planId].phases[0].entryCriteria).toContain('schema done');
    expect(graph.nodes[plan.planId].phases[0].exitCriteria).toContain('tests pass');
  });

  it('Plan graph saves and loads correctly', () => {
    const graph = createPlanGraph();
    createPlan(graph, makePlan({ title: 'Saved Plan' }));
    savePlanGraph(graph);
    const loaded = loadPlanGraph();
    expect(loaded.rootPlanIds.length).toBe(1);
    const plan = loaded.nodes[loaded.rootPlanIds[0]];
    expect(plan.title).toBe('Saved Plan');
  });

  it('Active plan null when none active', () => {
    const graph = createPlanGraph();
    expect(getActivePlan(graph)).toBeNull();
  });
});
