import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const TEST_DIR = mkdtempSync(join(tmpdir(), 'agent-integration-test-'));
process.env.HOME = TEST_DIR;

const {
  CAUSAL_REGISTRY_PATH,
  PLAN_GRAPH_PATH,
} = await import('../../src/anti-drift/types.js');

describe('agent-integration', () => {
  beforeEach(() => {
    [CAUSAL_REGISTRY_PATH(), PLAN_GRAPH_PATH()].forEach((p) => {
      try {
        rmSync(p, { recursive: true, force: true });
      } catch {}
    });
  });

  it('getSessionContext returns message when no plan graph exists', async () => {
    const { getSessionContext } = await import('../../src/agent-integration.js');
    const ctx = getSessionContext();
    expect(ctx).toContain('No active plan');
  });

  it('getSessionContext returns context when active plan exists', async () => {
    const { createPlanGraph, createPlan, savePlanGraph } = await import('../../src/anti-drift/plan-graph.js');
    const graph = createPlanGraph();
    createPlan(graph, {
      planType: 'main',
      title: 'Test Plan',
      description: 'Test',
      status: 'active',
      phases: [{ phaseId: 'p1', title: 'Phase 1', status: 'active', order: 1, spawnedSidePlanIds: [], recordIds: [], entryCriteria: [], exitCriteria: [] }],
      currentPhaseIndex: 0,
      checklistId: 'chk-1',
      tags: [],
      estimatedTurns: 5,
      actualTurns: 0,
    });
    savePlanGraph(graph);

    const { getSessionContext } = await import('../../src/agent-integration.js');
    const ctx = getSessionContext();
    expect(ctx).toContain('Test Plan');
  });

  it('recordUserPrompt appends a record to causal registry', async () => {
    const { recordUserPrompt } = await import('../../src/agent-integration.js');
    const { getTotalRecordCount } = await import('../../src/anti-drift/causal-registry.js');

    const before = getTotalRecordCount();
    recordUserPrompt('Hello world', 'orchestrator');
    const after = getTotalRecordCount();

    expect(after).toBe(before + 1);
  });

  it('recordUserPrompt tags include role', async () => {
    const { recordUserPrompt } = await import('../../src/agent-integration.js');
    const { searchRecordsByTag } = await import('../../src/anti-drift/causal-registry.js');

    recordUserPrompt('Test prompt', 'worker');
    const results = searchRecordsByTag('worker');
    expect(results.length).toBeGreaterThan(0);
  });

  it('recordUserPrompt with orchestrator role tags correctly', async () => {
    const { recordUserPrompt } = await import('../../src/agent-integration.js');
    const { searchRecordsByTag } = await import('../../src/anti-drift/causal-registry.js');

    recordUserPrompt('Orchestrator test', 'orchestrator');
    const results = searchRecordsByTag('orchestrator');
    expect(results.length).toBeGreaterThan(0);
  });

  it('recordUserPrompt creates plan graph if none exists', async () => {
    const { recordUserPrompt } = await import('../../src/agent-integration.js');
    const { loadPlanGraph } = await import('../../src/anti-drift/plan-graph.js');

    recordUserPrompt('Test', 'orchestrator');
    const graph = loadPlanGraph();
    expect(graph).toBeDefined();
  });

  it('recordUserPrompt uses active plan from existing graph', async () => {
    const { createPlanGraph, createPlan, savePlanGraph } = await import('../../src/anti-drift/plan-graph.js');
    const graph = createPlanGraph();
    const plan = createPlan(graph, {
      planType: 'main',
      title: 'Existing Plan',
      description: 'Test',
      status: 'active',
      phases: [],
      currentPhaseIndex: 0,
      checklistId: 'chk-1',
      tags: [],
      estimatedTurns: 1,
      actualTurns: 0,
    });
    savePlanGraph(graph);

    const { recordUserPrompt } = await import('../../src/agent-integration.js');
    const { getLastNRecords } = await import('../../src/anti-drift/causal-registry.js');

    recordUserPrompt('Test with plan', 'orchestrator');
    const records = getLastNRecords(1);
    expect(records[0].planContext.planId).toBe(plan.planId);
  });

  it('getSessionContext with plan graph but no active plan', async () => {
    const { createPlanGraph, savePlanGraph } = await import('../../src/anti-drift/plan-graph.js');
    const graph = createPlanGraph();
    savePlanGraph(graph);

    const { getSessionContext } = await import('../../src/agent-integration.js');
    const ctx = getSessionContext();
    expect(ctx).toContain('No active plan');
  });

  it('recordUserPrompt decision type is continue-plan', async () => {
    const { recordUserPrompt } = await import('../../src/agent-integration.js');
    const { getLastNRecords } = await import('../../src/anti-drift/causal-registry.js');

    recordUserPrompt('Test decision type', 'worker');
    const records = getLastNRecords(1);
    expect(records[0].decision.type).toBe('continue-plan');
  });

  it('recordUserPrompt records correct description', async () => {
    const { recordUserPrompt } = await import('../../src/agent-integration.js');
    const { getLastNRecords } = await import('../../src/anti-drift/causal-registry.js');

    recordUserPrompt('Description test', 'orchestrator');
    const records = getLastNRecords(1);
    expect(records[0].decision.description).toContain('orchestrator');
  });
});
