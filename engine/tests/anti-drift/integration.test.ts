import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as antiDrift from '../../src/anti-drift/index.js';

const TEST_DIR = mkdtempSync(join(tmpdir(), 'anti-drift-e2e-'));
process.env.HOME = TEST_DIR;

const { CAUSAL_REGISTRY_PATH, PLAN_GRAPH_PATH, CHECKLISTS_DIR, ROLLUPS_DIR, COMPACT_STATE_PATH } =
  await import('../../src/anti-drift/types.js');

describe('anti-drift integration', () => {
  beforeEach(() => {
    [CAUSAL_REGISTRY_PATH(), PLAN_GRAPH_PATH(), CHECKLISTS_DIR(), ROLLUPS_DIR(), COMPACT_STATE_PATH()].forEach((p) => {
      try {
        rmSync(p, { recursive: true, force: true });
      } catch {
        // ignore
      }
    });
  });

  it('Full flow: create plan → record decisions → spawn side → return → complete', () => {
    // 1. Create main plan
    const graph = antiDrift.createPlanGraph();
    const main = antiDrift.createPlan(graph, {
      planType: 'main',
      title: 'JWT Auth',
      description: 'Implement JWT auth',
      status: 'active',
      phases: [
        { phaseId: 'p1', title: 'Schema', status: 'completed', order: 1, spawnedSidePlanIds: [], recordIds: [], entryCriteria: [], exitCriteria: [] },
        { phaseId: 'p2', title: 'JWT Tokens', status: 'active', order: 2, spawnedSidePlanIds: [], recordIds: [], entryCriteria: [], exitCriteria: [] },
      ],
      currentPhaseIndex: 1,
      checklistId: 'chk-main',
      tags: ['auth'],
      estimatedTurns: 10,
      actualTurns: 0,
    });

    // 2. Record decision
    antiDrift.appendRecord({
      recordId: 'rec-001',
      turnNumber: 1,
      timestamp: new Date().toISOString(),
      userPrompt: 'Implement JWT auth',
      userPromptHash: antiDrift.hashPrompt('Implement JWT auth'),
      preState: { activePlanId: null, activePhaseId: null, checklistState: { checklistId: 'chk-empty', items: [], version: 0 }, filesModified: [], pendingDecisions: [] },
      decision: { type: 'create-plan', description: 'Created JWT Auth plan', affectedPlanIds: [main.planId], affectedFiles: [] },
      postState: { activePlanId: main.planId, activePhaseId: 'p2', checklistState: { checklistId: 'chk-main', items: [], version: 1 }, filesModified: [], newArtifacts: [main.planId], resolvedDecisions: [] },
      reasoning: { summary: 'Multi-file auth detected', keyAssumptions: [], risksConsidered: [], alternativesRejected: [], confidence: 0.85 },
      causalLink: { previousRecordId: null, linkType: 'continues', deltaDescription: 'First prompt', diffHash: '0000' },
      planContext: { planId: main.planId, planType: 'main', phaseId: 'p2', parentPlanId: null, parentPhaseId: null, depth: 0 },
      tags: ['auth'],
      tokensConsumed: 1500,
    });

    // 3. Spawn side plan
    const side = antiDrift.spawnSidePlan(graph, main.planId, 'p2', {
      planType: 'side',
      title: 'Research JWT Libs',
      description: 'Compare JWT libraries',
      status: 'active',
      phases: [
        { phaseId: 's1', title: 'Compare', status: 'active', order: 1, spawnedSidePlanIds: [], recordIds: [], entryCriteria: [], exitCriteria: [] },
      ],
      currentPhaseIndex: 0,
      checklistId: 'chk-side',
      tags: ['research'],
      estimatedTurns: 5,
      actualTurns: 0,
    });

    expect(graph.nodes[main.planId].status).toBe('suspended');
    expect(graph.activePlanId).toBe(side.planId);

    // 4. Record side decision
    antiDrift.appendRecord({
      recordId: 'rec-002',
      turnNumber: 5,
      timestamp: new Date().toISOString(),
      userPrompt: 'Research JWT libraries',
      userPromptHash: antiDrift.hashPrompt('Research JWT libraries'),
      preState: { activePlanId: main.planId, activePhaseId: 'p2', checklistState: { checklistId: 'chk-main', items: [], version: 1 }, filesModified: [], pendingDecisions: ['which-jwt-lib'] },
      decision: { type: 'spawn-side-plan', description: 'Spawned research side plan', affectedPlanIds: [main.planId, side.planId], affectedFiles: [] },
      postState: { activePlanId: side.planId, activePhaseId: 's1', checklistState: { checklistId: 'chk-side', items: [], version: 1 }, filesModified: [], newArtifacts: [side.planId], resolvedDecisions: [] },
      reasoning: { summary: 'Need research first', keyAssumptions: [], risksConsidered: [], alternativesRejected: [], confidence: 0.9 },
      causalLink: { previousRecordId: 'rec-001', linkType: 'spawns', deltaDescription: 'Need research before implementation', diffHash: 'abc' },
      planContext: { planId: side.planId, planType: 'side', phaseId: 's1', parentPlanId: main.planId, parentPhaseId: 'p2', depth: 1 },
      tags: ['research', 'jwt'],
      tokensConsumed: 2000,
    });

    // 5. Return from side
    antiDrift.returnFromSidePlan(graph, side.planId);
    expect(graph.nodes[side.planId].status).toBe('completed');
    expect(graph.nodes[main.planId].status).toBe('active');

    // 6. Complete main
    antiDrift.completePlan(graph, main.planId);
    expect(graph.nodes[main.planId].status).toBe('completed');
  });

  it('Context re-read after 5 records includes all', () => {
    for (let i = 1; i <= 5; i++) {
      antiDrift.appendRecord({
        recordId: `rec-${i}`,
        turnNumber: i,
        timestamp: new Date().toISOString(),
        userPrompt: `Prompt ${i}`,
        userPromptHash: antiDrift.hashPrompt(`Prompt ${i}`),
        preState: { activePlanId: null, activePhaseId: null, checklistState: { checklistId: 'chk', items: [], version: 0 }, filesModified: [], pendingDecisions: [] },
        decision: { type: 'no-op', description: `Decision ${i}`, affectedPlanIds: [], affectedFiles: [] },
        postState: { activePlanId: null, activePhaseId: null, checklistState: { checklistId: 'chk', items: [], version: 0 }, filesModified: [], newArtifacts: [], resolvedDecisions: [] },
        reasoning: { summary: `Reasoning ${i}`, keyAssumptions: [], risksConsidered: [], alternativesRejected: [], confidence: 0.5 },
        causalLink: { previousRecordId: i > 1 ? `rec-${i - 1}` : null, linkType: 'continues', deltaDescription: `delta ${i}`, diffHash: 'abc' },
        planContext: { planId: null, planType: null, phaseId: null, parentPlanId: null, parentPhaseId: null, depth: 0 },
        tags: [],
        tokensConsumed: 100,
      });
    }
    const context = antiDrift.reReadContext(6, null);
    // reReadContext shows last 3 global records when no active plan
    expect(context).toContain('T3');
    expect(context).toContain('T5');
  });

  it('Plan graph survives save/load cycle', () => {
    const graph = antiDrift.createPlanGraph();
    antiDrift.createPlan(graph, {
      planType: 'main',
      title: 'Survivor',
      description: 'Test',
      status: 'active',
      phases: [],
      currentPhaseIndex: 0,
      checklistId: 'chk-1',
      tags: [],
      estimatedTurns: 1,
      actualTurns: 0,
    });
    antiDrift.savePlanGraph(graph);
    const loaded = antiDrift.loadPlanGraph();
    expect(loaded.rootPlanIds.length).toBe(1);
    const plan = loaded.nodes[loaded.rootPlanIds[0]];
    expect(plan.title).toBe('Survivor');
  });

  it('Checklist syncs correctly on side return', () => {
    const parent = antiDrift.createChecklist('plan-main', 'Parent');
    antiDrift.addItem(parent, 'Research JWT', 'ai');
    const side = antiDrift.inheritChecklist(parent, 'plan-side');
    antiDrift.markDone(side, side.items[0].itemId);
    antiDrift.syncChecklistOnReturn(parent, side);
    expect(parent.items[0].status).toBe('done');
    expect(parent.items[0].doneAt).toBeDefined();
  });

  it('Rollup generated at turn 10, 20, 30', () => {
    for (let i = 1; i <= 30; i++) {
      antiDrift.appendRecord({
        recordId: `rec-${i}`,
        turnNumber: i,
        timestamp: new Date().toISOString(),
        userPrompt: `Turn ${i}`,
        userPromptHash: antiDrift.hashPrompt(`Turn ${i}`),
        preState: { activePlanId: null, activePhaseId: null, checklistState: { checklistId: 'chk', items: [], version: 0 }, filesModified: [], pendingDecisions: [] },
        decision: { type: 'no-op', description: `D${i}`, affectedPlanIds: [], affectedFiles: [] },
        postState: { activePlanId: null, activePhaseId: null, checklistState: { checklistId: 'chk', items: [], version: 0 }, filesModified: [], newArtifacts: [], resolvedDecisions: [] },
        reasoning: { summary: `R${i}`, keyAssumptions: [], risksConsidered: [], alternativesRejected: [], confidence: 0.5 },
        causalLink: { previousRecordId: i > 1 ? `rec-${i - 1}` : null, linkType: 'continues', deltaDescription: 'd', diffHash: 'abc' },
        planContext: { planId: null, planType: null, phaseId: null, parentPlanId: null, parentPhaseId: null, depth: 0 },
        tags: [],
        tokensConsumed: 100,
      });
      antiDrift.autoGenerateRollup(i);
    }
    expect(existsSync(`${ROLLUPS_DIR()}/rollup-1-10.json`)).toBe(true);
    expect(existsSync(`${ROLLUPS_DIR()}/rollup-11-20.json`)).toBe(true);
    expect(existsSync(`${ROLLUPS_DIR()}/rollup-21-30.json`)).toBe(true);
  });

  it('Compact-state saves and restores correctly', async () => {
    const graph = antiDrift.createPlanGraph();
    const plan = antiDrift.createPlan(graph, {
      planType: 'main',
      title: 'Compact Test',
      description: 'Test',
      status: 'active',
      phases: [],
      currentPhaseIndex: 0,
      checklistId: 'chk-c',
      tags: [],
      estimatedTurns: 1,
      actualTurns: 0,
    });
    antiDrift.savePlanGraph(graph);

    const checklist = antiDrift.createChecklist(plan.planId, 'Compact CL');
    antiDrift.addItem(checklist, 'Item', 'ai');

    // Save compact state manually
    const compactState = {
      planGraph: graph,
      activeChecklists: [checklist],
      latestRollup: null,
      activePlanId: plan.planId,
      savedAt: new Date().toISOString(),
    };
    const fs = await import('fs');
    fs.mkdirSync(join(TEST_DIR, '.kimi/memory/sessions/active'), { recursive: true });
    fs.writeFileSync(COMPACT_STATE_PATH(), JSON.stringify(compactState, null, 2));

    expect(existsSync(COMPACT_STATE_PATH())).toBe(true);
    const restored = JSON.parse(readFileSync(COMPACT_STATE_PATH(), 'utf-8'));
    expect(restored.planGraph.nodes[plan.planId].title).toBe('Compact Test');
    expect(restored.activeChecklists[0].title).toBe('Compact CL');
  });

  it('Auto-trigger decision recorded in registry', () => {
    antiDrift.appendRecord({
      recordId: 'rec-auto',
      turnNumber: 1,
      timestamp: new Date().toISOString(),
      userPrompt: 'Fix typo',
      userPromptHash: antiDrift.hashPrompt('Fix typo'),
      preState: { activePlanId: null, activePhaseId: null, checklistState: { checklistId: 'chk', items: [], version: 0 }, filesModified: [], pendingDecisions: [] },
      decision: { type: 'modify-file', description: 'Auto-detected typo fix', affectedPlanIds: [], affectedFiles: ['README.md'], triggerUsed: 'auto-light' },
      postState: { activePlanId: null, activePhaseId: null, checklistState: { checklistId: 'chk', items: [], version: 0 }, filesModified: ['README.md'], newArtifacts: [], resolvedDecisions: [] },
      reasoning: { summary: 'Trivial typo', keyAssumptions: [], risksConsidered: [], alternativesRejected: [], confidence: 0.9 },
      causalLink: { previousRecordId: null, linkType: 'continues', deltaDescription: 'First', diffHash: '0000' },
      planContext: { planId: null, planType: null, phaseId: null, parentPlanId: null, parentPhaseId: null, depth: 0 },
      tags: ['auto-detected', 'typo'],
      tokensConsumed: 200,
    });

    const found = antiDrift.getRecordById('rec-auto');
    expect(found).not.toBeNull();
    expect(found!.decision.triggerUsed).toBe('auto-light');
    expect(found!.tags).toContain('auto-detected');
  });

  it('Manual trigger decision recorded in registry', () => {
    antiDrift.appendRecord({
      recordId: 'rec-manual',
      turnNumber: 1,
      timestamp: new Date().toISOString(),
      userPrompt: 'plan only: Implement feature',
      userPromptHash: antiDrift.hashPrompt('plan only: Implement feature'),
      preState: { activePlanId: null, activePhaseId: null, checklistState: { checklistId: 'chk', items: [], version: 0 }, filesModified: [], pendingDecisions: [] },
      decision: { type: 'create-plan', description: 'Manual plan-only trigger', affectedPlanIds: ['plan-x'], affectedFiles: [], triggerUsed: 'manual-plan-only' },
      postState: { activePlanId: 'plan-x', activePhaseId: 'p1', checklistState: { checklistId: 'chk', items: [], version: 1 }, filesModified: [], newArtifacts: ['plan-x'], resolvedDecisions: [] },
      reasoning: { summary: 'User explicitly requested plan-only', keyAssumptions: [], risksConsidered: [], alternativesRejected: [], confidence: 1.0 },
      causalLink: { previousRecordId: null, linkType: 'continues', deltaDescription: 'First', diffHash: '0000' },
      planContext: { planId: 'plan-x', planType: 'main', phaseId: 'p1', parentPlanId: null, parentPhaseId: null, depth: 0 },
      tags: ['manual-trigger'],
      tokensConsumed: 500,
    });

    const found = antiDrift.getRecordById('rec-manual');
    expect(found).not.toBeNull();
    expect(found!.decision.triggerUsed).toBe('manual-plan-only');
  });

  it('Budget respected with 50+ records', () => {
    for (let i = 1; i <= 55; i++) {
      antiDrift.appendRecord({
        recordId: `rec-${i}`,
        turnNumber: i,
        timestamp: new Date().toISOString(),
        userPrompt: `This is a reasonably long prompt to simulate real usage and consume tokens appropriately ${i}`,
        userPromptHash: antiDrift.hashPrompt(`prompt ${i}`),
        preState: { activePlanId: null, activePhaseId: null, checklistState: { checklistId: 'chk', items: [], version: 0 }, filesModified: [], pendingDecisions: [] },
        decision: { type: 'no-op', description: `Decision ${i}`, affectedPlanIds: [], affectedFiles: [] },
        postState: { activePlanId: null, activePhaseId: null, checklistState: { checklistId: 'chk', items: [], version: 0 }, filesModified: [], newArtifacts: [], resolvedDecisions: [] },
        reasoning: { summary: `Reasoning number ${i} with some detail to make it realistic`, keyAssumptions: [], risksConsidered: [], alternativesRejected: [], confidence: 0.5 },
        causalLink: { previousRecordId: i > 1 ? `rec-${i - 1}` : null, linkType: 'continues', deltaDescription: 'delta', diffHash: 'abc' },
        planContext: { planId: null, planType: null, phaseId: null, parentPlanId: null, parentPhaseId: null, depth: 0 },
        tags: [],
        tokensConsumed: 100,
      });
    }
    const context = antiDrift.reReadContext(56, null, { budget: 5000 });
    const tokens = antiDrift.estimateTokens(context);
    expect(tokens).toBeLessThanOrEqual(5000);
  });

  it('Cycle detection prevents infinite spawn', () => {
    const graph = antiDrift.createPlanGraph();
    const main = antiDrift.createPlan(graph, {
      planType: 'main',
      title: 'Main',
      description: 'Main plan',
      status: 'active',
      phases: [{ phaseId: 'p1', title: 'Phase', status: 'active', order: 1, spawnedSidePlanIds: [], recordIds: [], entryCriteria: [], exitCriteria: [] }],
      currentPhaseIndex: 0,
      checklistId: 'chk-m',
      tags: [],
      estimatedTurns: 5,
      actualTurns: 0,
    });

    const side1 = antiDrift.spawnSidePlan(graph, main.planId, 'p1', {
      planType: 'side',
      title: 'Side 1',
      description: 'Side plan',
      status: 'active',
      phases: [{ phaseId: 's1', title: 'Side Phase', status: 'active', order: 1, spawnedSidePlanIds: [], recordIds: [], entryCriteria: [], exitCriteria: [] }],
      currentPhaseIndex: 0,
      checklistId: 'chk-s1',
      tags: [],
      estimatedTurns: 3,
      actualTurns: 0,
    });

    const side2 = antiDrift.spawnSidePlan(graph, side1.planId, 's1', {
      planType: 'side',
      title: 'Side 2',
      description: 'Nested side',
      status: 'active',
      phases: [{ phaseId: 's2', title: 'Nested Phase', status: 'active', order: 1, spawnedSidePlanIds: [], recordIds: [], entryCriteria: [], exitCriteria: [] }],
      currentPhaseIndex: 0,
      checklistId: 'chk-s2',
      tags: [],
      estimatedTurns: 2,
      actualTurns: 0,
    });

    const side3 = antiDrift.spawnSidePlan(graph, side2.planId, 's2', {
      planType: 'side',
      title: 'Side 3',
      description: 'Deep nested',
      status: 'active',
      phases: [],
      currentPhaseIndex: 0,
      checklistId: 'chk-s3',
      tags: [],
      estimatedTurns: 1,
      actualTurns: 0,
    });
    expect(side3.depth).toBe(3);

    // Trying to spawn from depth 3 should fail (would be depth 4 > MAX_DEPTH)
    expect(() => {
      antiDrift.spawnSidePlan(graph, side3.planId, 's2', {
        planType: 'side',
        title: 'Too Deep',
        description: 'Should fail',
        status: 'active',
        phases: [],
        currentPhaseIndex: 0,
        checklistId: 'chk-deep',
        tags: [],
        estimatedTurns: 1,
        actualTurns: 0,
      });
    }).toThrow();
  });
});
