import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { CausalRecord } from '../../src/anti-drift/types.js';
import {
  generateRollupRecord,
  saveRollup,
  loadRollup,
  getLatestRollup,
  shouldGenerateRollup,
  autoGenerateRollup,
} from '../../src/anti-drift/rollup-generator.js';

const TEST_DIR = mkdtempSync(join(tmpdir(), 'anti-drift-rollup-test-'));
process.env.HOME = TEST_DIR;

const { CAUSAL_REGISTRY_PATH, ROLLUPS_DIR } = await import('../../src/anti-drift/types.js');

function makeRecord(overrides?: Partial<CausalRecord>): CausalRecord {
  return {
    recordId: `rec-${Math.random().toString(36).slice(2)}`,
    turnNumber: 1,
    timestamp: new Date().toISOString(),
    userPrompt: 'test',
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
      description: 'Created plan',
      affectedPlanIds: ['plan-1'],
      affectedFiles: ['src/file.ts'],
    },
    postState: {
      activePlanId: 'plan-1',
      activePhaseId: 'p1',
      checklistState: { checklistId: 'chk-1', items: [], version: 1 },
      filesModified: ['src/file.ts'],
      newArtifacts: ['plan-1'],
      resolvedDecisions: [],
    },
    reasoning: {
      summary: 'Good decision',
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

describe('rollup-generator', () => {
  beforeEach(() => {
    [CAUSAL_REGISTRY_PATH(), ROLLUPS_DIR()].forEach((p) => {
      try {
        rmSync(p, { recursive: true, force: true });
      } catch {
        // ignore
      }
    });
  });

  it('generateRollupRecord creates valid object', async () => {
    const { appendRecord } = await import('../../src/anti-drift/causal-registry.js');
    appendRecord(makeRecord({ turnNumber: 1 }));
    appendRecord(makeRecord({ turnNumber: 2 }));
    const rollup = generateRollupRecord(1, 2);
    expect(rollup.rollupId).toBe('rollup-1-2');
    expect(rollup.coversTurns).toEqual([1, 2]);
  });

  it('coversTurns range is correct', async () => {
    const { appendRecord } = await import('../../src/anti-drift/causal-registry.js');
    for (let i = 1; i <= 5; i++) {
      appendRecord(makeRecord({ turnNumber: i }));
    }
    const rollup = generateRollupRecord(1, 5);
    expect(rollup.coversTurns[0]).toBe(1);
    expect(rollup.coversTurns[1]).toBe(5);
  });

  it('summary is non-empty', async () => {
    const { appendRecord } = await import('../../src/anti-drift/causal-registry.js');
    appendRecord(makeRecord({ turnNumber: 1 }));
    const rollup = generateRollupRecord(1, 1);
    expect(rollup.summary.length).toBeGreaterThan(0);
    expect(rollup.summary).toContain('Turns 1-1');
  });

  it('keyDecisions populated', async () => {
    const { appendRecord } = await import('../../src/anti-drift/causal-registry.js');
    appendRecord(makeRecord({ turnNumber: 1, reasoning: { summary: 'Key choice', keyAssumptions: [], risksConsidered: [], alternativesRejected: [], confidence: 0.8 } }));
    const rollup = generateRollupRecord(1, 1);
    expect(rollup.keyDecisions.length).toBeGreaterThan(0);
    expect(rollup.keyDecisions[0]).toContain('Key choice');
  });

  it('plansCreated tracked', async () => {
    const { appendRecord } = await import('../../src/anti-drift/causal-registry.js');
    appendRecord(makeRecord({ turnNumber: 1, decision: { type: 'create-plan', description: 'Created', affectedPlanIds: ['plan-a'], affectedFiles: [] } }));
    const rollup = generateRollupRecord(1, 1);
    expect(rollup.plansCreated).toContain('plan-a');
  });

  it('plansCompleted tracked', async () => {
    const { appendRecord } = await import('../../src/anti-drift/causal-registry.js');
    appendRecord(makeRecord({ turnNumber: 1, decision: { type: 'return-from-side', description: 'Side completed', affectedPlanIds: ['plan-b'], affectedFiles: [] } }));
    const rollup = generateRollupRecord(1, 1);
    expect(rollup.plansCompleted).toContain('plan-b');
  });

  it('filesModified tracked', async () => {
    const { appendRecord } = await import('../../src/anti-drift/causal-registry.js');
    appendRecord(makeRecord({ turnNumber: 1, postState: { activePlanId: null, activePhaseId: null, checklistState: { checklistId: 'chk', items: [], version: 0 }, filesModified: ['src/x.ts'], newArtifacts: [], resolvedDecisions: [] } }));
    const rollup = generateRollupRecord(1, 1);
    expect(rollup.filesModified).toContain('src/x.ts');
  });

  it('saveRollup writes to correct path', async () => {
    const rollup = generateRollupRecord(1, 1);
    saveRollup(rollup);
    expect(
      (await import('fs')).existsSync(`${ROLLUPS_DIR()}/${rollup.rollupId}.json`)
    ).toBe(true);
  });

  it('loadRollup reads back correctly', () => {
    const rollup = generateRollupRecord(1, 1);
    saveRollup(rollup);
    const loaded = loadRollup(rollup.rollupId);
    expect(loaded).not.toBeNull();
    expect(loaded!.coversTurns).toEqual([1, 1]);
    expect(loaded!.summary).toBe(rollup.summary);
  });

  it('shouldGenerateRollup true every 10 turns', () => {
    expect(shouldGenerateRollup(10)).toBe(true);
    expect(shouldGenerateRollup(20)).toBe(true);
    expect(shouldGenerateRollup(30)).toBe(true);
    expect(shouldGenerateRollup(5)).toBe(false);
    expect(shouldGenerateRollup(0)).toBe(false);
  });

  it('autoGenerateRollup creates and saves rollup file at interval turns', async () => {
    const rollup = autoGenerateRollup(10);
    expect(rollup).not.toBeNull();
    if (rollup) {
      expect(
        (await import('fs')).existsSync(`${ROLLUPS_DIR()}/${rollup.rollupId}.json`)
      ).toBe(true);
    }
  });

  it('autoGenerateRollup returns null at non-interval turns', () => {
    const rollup = autoGenerateRollup(5);
    expect(rollup).toBeNull();
  });
});
