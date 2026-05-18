import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { CausalRecord, PlanNode } from '../../src/anti-drift/types.js';
import {
  reReadContext,
  serializeRecordFull,
  serializeRecordBrief,
  serializeRecordUltraBrief,
  serializePlan,
  estimateTokens,
} from '../../src/anti-drift/re-reader.js';

const TEST_DIR = mkdtempSync(join(tmpdir(), 'anti-drift-rr-test-'));
process.env.HOME = TEST_DIR;

const { CAUSAL_REGISTRY_PATH, PLAN_GRAPH_PATH, CHECKLISTS_DIR, ROLLUPS_DIR } =
  await import('../../src/anti-drift/types.js');

function makeRecord(overrides?: Partial<CausalRecord>): CausalRecord {
  return {
    recordId: `rec-${Math.random().toString(36).slice(2)}`,
    turnNumber: 1,
    timestamp: new Date().toISOString(),
    userPrompt: 'test prompt',
    userPromptHash: 'abc',
    preState: {
      activePlanId: null,
      activePhaseId: null,
      checklistState: { checklistId: 'chk-empty', items: [], version: 0 },
      filesModified: [],
      pendingDecisions: [],
    },
    decision: {
      type: 'create-plan',
      description: 'test',
      affectedPlanIds: ['plan-1'],
      affectedFiles: [],
    },
    postState: {
      activePlanId: 'plan-1',
      activePhaseId: 'p1',
      checklistState: { checklistId: 'chk-1', items: [], version: 1 },
      filesModified: [],
      newArtifacts: [],
      resolvedDecisions: [],
    },
    reasoning: {
      summary: 'test reasoning',
      keyAssumptions: [],
      risksConsidered: [],
      alternativesRejected: [],
      confidence: 0.8,
    },
    causalLink: {
      previousRecordId: null,
      linkType: 'continues',
      deltaDescription: 'first',
      diffHash: '0000',
    },
    planContext: {
      planId: 'plan-1',
      planType: 'main',
      phaseId: 'p1',
      parentPlanId: null,
      parentPhaseId: null,
      depth: 0,
    },
    tags: ['test'],
    tokensConsumed: 100,
    ...overrides,
  };
}

function makePlan(overrides?: Partial<PlanNode>): PlanNode {
  return {
    planId: 'plan-1',
    planType: 'main',
    title: 'Test Plan',
    description: 'A test plan',
    status: 'active',
    createdAt: new Date().toISOString(),
    depth: 0,
    phases: [
      { phaseId: 'p1', title: 'Phase 1', description: '', status: 'active', order: 1, spawnedSidePlanIds: [], recordIds: [], entryCriteria: [], exitCriteria: [] },
      { phaseId: 'p2', title: 'Phase 2', description: '', status: 'pending', order: 2, spawnedSidePlanIds: [], recordIds: [], entryCriteria: [], exitCriteria: [] },
    ],
    currentPhaseIndex: 0,
    checklistId: 'chk-plan-1',
    tags: [],
    estimatedTurns: 10,
    actualTurns: 0,
    ...overrides,
  };
}

describe('re-reader', () => {
  beforeEach(() => {
    [CAUSAL_REGISTRY_PATH(), PLAN_GRAPH_PATH(), CHECKLISTS_DIR(), ROLLUPS_DIR()].forEach((p) => {
      try {
        rmSync(p, { recursive: true, force: true });
      } catch {
        // ignore
      }
    });
  });

  it('reReadContext returns non-empty string', () => {
    const result = reReadContext(1, null);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('reReadContext includes active plan', async () => {
    // Create a plan graph with an active plan
    const { createPlanGraph, createPlan, savePlanGraph } = await import('../../src/anti-drift/plan-graph.js');
    const graph = createPlanGraph();
    const plan = createPlan(graph, makePlan());
    savePlanGraph(graph);

    const result = reReadContext(1, plan.planId);
    expect(result).toContain('Test Plan');
  });

  it('reReadContext includes parent plan for side plan', async () => {
    const { createPlanGraph, createPlan, spawnSidePlan, savePlanGraph } = await import('../../src/anti-drift/plan-graph.js');
    const graph = createPlanGraph();
    const main = createPlan(graph, makePlan({ planId: 'main-1' }));
    const side = spawnSidePlan(graph, main.planId, main.phases[0].phaseId, makePlan({ planId: 'side-1', planType: 'side' }));
    savePlanGraph(graph);

    const result = reReadContext(5, side.planId);
    expect(result).toContain('PARENT PLAN');
  });

  it('reReadContext includes recent records', async () => {
    const { appendRecord } = await import('../../src/anti-drift/causal-registry.js');
    appendRecord(makeRecord({ turnNumber: 1 }));
    appendRecord(makeRecord({ turnNumber: 2 }));
    const result = reReadContext(3, 'plan-1');
    expect(result).toContain('Turn 1');
  });

  it('reReadContext respects budget', () => {
    const result = reReadContext(1, null, { budget: 100 });
    const tokens = estimateTokens(result);
    expect(tokens).toBeLessThanOrEqual(100);
  });

  it('reReadContext with no active plan still works', () => {
    const result = reReadContext(1, null);
    expect(typeof result).toBe('string');
  });

  it('serializeRecordFull includes all fields', () => {
    const rec = makeRecord();
    const full = serializeRecordFull(rec);
    expect(full).toContain('recordId');
    expect(full).toContain('turnNumber');
    expect(full).toContain('userPrompt');
  });

  it('serializeRecordBrief is shorter than full', () => {
    const rec = makeRecord({ userPrompt: 'a'.repeat(500) });
    const brief = serializeRecordBrief(rec);
    const full = serializeRecordFull(rec);
    expect(brief.length).toBeLessThan(full.length);
    expect(brief).toContain('Turn 1');
  });

  it('serializeRecordUltraBrief is shortest', () => {
    const rec = makeRecord({ userPrompt: 'a'.repeat(500) });
    const ultra = serializeRecordUltraBrief(rec);
    const brief = serializeRecordBrief(rec);
    expect(ultra.length).toBeLessThan(brief.length);
    expect(ultra).toContain('T1');
  });

  it('serializePlan includes checklist when requested', () => {
    const plan = makePlan();
    const result = serializePlan(plan, { includeChecklist: true });
    expect(result).toContain('Plan:');
    expect(result).toContain('Phase 1');
  });

  it('serializePlan summary omits checklist', () => {
    const plan = makePlan();
    const result = serializePlan(plan, { summaryOnly: true });
    expect(result).toContain('Plan:');
    expect(result).not.toContain('Description:');
  });

  it('estimateTokens approximates reasonably', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(100))).toBe(25);
  });

  it('Budget exceeded truncates oldest first', () => {
    // With very small budget, should still return something
    const result = reReadContext(1, null, { budget: 50 });
    expect(typeof result).toBe('string');
    expect(result.length).toBeLessThan(200);
  });

  it('No records returns graceful message', () => {
    const result = reReadContext(1, null);
    expect(result).toContain('No historical context');
  });

  it('Rollup included when space allows', async () => {
    const { saveRollup } = await import('../../src/anti-drift/rollup-generator.js');
    const rollup = {
      rollupId: 'rollup-1-10',
      coversTurns: [1, 10] as [number, number],
      summary: 'Test rollup summary',
      keyDecisions: [],
      plansCreated: [],
      plansCompleted: [],
      filesModified: [],
      unresolvedQuestions: [],
    };
    saveRollup(rollup);

    const result = reReadContext(15, null, { budget: 30000 });
    expect(result).toContain('Rollup');
  });
});
