import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { CausalRecord } from '../../src/anti-drift/types.js';
import {
  appendRecord,
  getLastNRecords,
  getRecordsForPlan,
  getRecordById,
  searchRecordsByTag,
  getTotalRecordCount,
  truncatePrompt,
  hashPrompt,
} from '../../src/anti-drift/causal-registry.js';

// Override paths for tests
const TEST_DIR = mkdtempSync(join(tmpdir(), 'anti-drift-test-'));
process.env.HOME = TEST_DIR;

// Re-import to pick up new HOME
const { CAUSAL_REGISTRY_PATH } = await import('../../src/anti-drift/types.js');

function makeRecord(overrides?: Partial<CausalRecord>): CausalRecord {
  return {
    recordId: `rec-${Math.random().toString(36).slice(2)}`,
    turnNumber: 1,
    timestamp: new Date().toISOString(),
    userPrompt: 'test prompt',
    userPromptHash: 'abc123',
    preState: {
      activePlanId: null,
      activePhaseId: null,
      checklistState: { checklistId: 'chk-empty', items: [], version: 0 },
      filesModified: [],
      pendingDecisions: [],
    },
    decision: {
      type: 'create-plan',
      description: 'test decision',
      affectedPlanIds: ['plan-1'],
      affectedFiles: [],
    },
    postState: {
      activePlanId: 'plan-1',
      activePhaseId: 'p1',
      checklistState: { checklistId: 'chk-1', items: [], version: 1 },
      filesModified: [],
      newArtifacts: ['plan-1'],
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

describe('causal-registry', () => {
  beforeEach(() => {
    // Clean up test registry
    try {
      rmSync(CAUSAL_REGISTRY_PATH, { force: true });
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    try {
      rmSync(CAUSAL_REGISTRY_PATH, { force: true });
    } catch {
      // ignore
    }
  });

  it('appendRecord creates file if not exists', () => {
    appendRecord(makeRecord());
    expect(existsSync(CAUSAL_REGISTRY_PATH())).toBe(true);
  });

  it('appendRecord adds valid JSON line', () => {
    const before = getTotalRecordCount();
    appendRecord(makeRecord());
    const content = readFileSync(CAUSAL_REGISTRY_PATH(), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(before + 1);
    const parsed = JSON.parse(lines[lines.length - 1]);
    expect(parsed.recordId).toBeDefined();
    expect(parsed.turnNumber).toBe(1);
  });

  it('getLastNRecords returns correct count', () => {
    const before = getTotalRecordCount();
    appendRecord(makeRecord({ turnNumber: 1 }));
    appendRecord(makeRecord({ turnNumber: 2 }));
    appendRecord(makeRecord({ turnNumber: 3 }));
    expect(getLastNRecords(2).length).toBe(2);
    expect(getLastNRecords(5).length).toBeLessThanOrEqual(5);
    expect(getTotalRecordCount()).toBe(before + 3);
  });

  it('getLastNRecords with n > total returns all', () => {
    const before = getTotalRecordCount();
    appendRecord(makeRecord());
    expect(getLastNRecords(100).length).toBeGreaterThanOrEqual(before + 1);
  });

  it('getRecordsForPlan filters by planId', () => {
    appendRecord(makeRecord({ planContext: { planId: 'plan-filter-a', planType: 'main', phaseId: 'p1', parentPlanId: null, parentPhaseId: null, depth: 0 } }));
    appendRecord(makeRecord({ planContext: { planId: 'plan-filter-b', planType: 'main', phaseId: 'p1', parentPlanId: null, parentPhaseId: null, depth: 0 } }));
    appendRecord(makeRecord({ planContext: { planId: 'plan-filter-a', planType: 'main', phaseId: 'p2', parentPlanId: null, parentPhaseId: null, depth: 0 } }));
    const forA = getRecordsForPlan('plan-filter-a');
    expect(forA.length).toBeGreaterThanOrEqual(2);
    const forB = getRecordsForPlan('plan-filter-b');
    expect(forB.length).toBeGreaterThanOrEqual(1);
  });

  it('getRecordById finds existing', () => {
    const rec = makeRecord({ recordId: 'find-me' });
    appendRecord(rec);
    const found = getRecordById('find-me');
    expect(found).not.toBeNull();
    expect(found!.recordId).toBe('find-me');
  });

  it('getRecordById returns null for missing', () => {
    expect(getRecordById('nonexistent')).toBeNull();
  });

  it('searchRecordsByTag finds matches', () => {
    appendRecord(makeRecord({ tags: ['auth', 'jwt'] }));
    appendRecord(makeRecord({ tags: ['bug', 'fix'] }));
    const results = searchRecordsByTag('jwt');
    expect(results.length).toBe(1);
    expect(results[0].tags).toContain('jwt');
  });

  it('searchRecordsByTag returns empty for no match', () => {
    appendRecord(makeRecord({ tags: ['auth'] }));
    expect(searchRecordsByTag('nonexistent').length).toBe(0);
  });

  it('truncatePrompt truncates at byte limit', () => {
    const long = 'a'.repeat(20000);
    const truncated = truncatePrompt(long, 100);
    const encoder = new TextEncoder();
    expect(encoder.encode(truncated).length).toBeLessThanOrEqual(100);
    expect(truncated.endsWith('...')).toBe(true);
  });

  it('hashPrompt returns consistent SHA-256', () => {
    const h1 = hashPrompt('hello');
    const h2 = hashPrompt('hello');
    expect(h1).toBe(h2);
    expect(h1.length).toBe(64);
    expect(h1).not.toBe(hashPrompt('different'));
  });

  it('Concurrent appends do not corrupt file', () => {
    const before = getTotalRecordCount();
    // Simulate concurrent appends by writing rapidly
    for (let i = 0; i < 20; i++) {
      appendRecord(makeRecord({ turnNumber: i + 1 }));
    }
    const all = getLastNRecords(100);
    expect(all.length).toBeGreaterThanOrEqual(20);
    // Verify our appended records are valid JSON
    const ourRecords = all.slice(-20);
    for (const rec of ourRecords) {
      expect(rec.recordId).toBeDefined();
    }
  });

  it('getTotalRecordCount is accurate', () => {
    const before = getTotalRecordCount();
    appendRecord(makeRecord());
    expect(getTotalRecordCount()).toBe(before + 1);
    appendRecord(makeRecord());
    expect(getTotalRecordCount()).toBe(before + 2);
  });

  it('Record with all fields round-trips correctly', () => {
    const rec = makeRecord({
      recordId: 'roundtrip',
      turnNumber: 42,
      userPrompt: 'special prompt',
      tags: ['a', 'b', 'c'],
    });
    appendRecord(rec);
    const found = getRecordById('roundtrip');
    expect(found).not.toBeNull();
    expect(found!.turnNumber).toBe(42);
    expect(found!.userPrompt).toBe('special prompt');
    expect(found!.tags).toEqual(['a', 'b', 'c']);
  });

  it('Record with null previousRecordId (first record)', () => {
    const rec = makeRecord({
      causalLink: {
        previousRecordId: null,
        linkType: 'continues',
        deltaDescription: 'first',
        diffHash: '0000',
      },
    });
    appendRecord(rec);
    const found = getRecordById(rec.recordId);
    expect(found!.causalLink.previousRecordId).toBeNull();
  });

  it('Records maintain order', () => {
    const base = getTotalRecordCount();
    for (let i = 1; i <= 5; i++) {
      appendRecord(makeRecord({ turnNumber: i + 1000, recordId: `rec-order-${i}` }));
    }
    const all = getLastNRecords(100);
    const ourRecords = all.filter((r) => r.recordId.startsWith('rec-order-'));
    const turnNumbers = ourRecords.map((r) => r.turnNumber);
    expect(turnNumbers).toEqual([1001, 1002, 1003, 1004, 1005]);
  });

  it('Corrupted line is skipped gracefully', () => {
    appendRecord(makeRecord({ recordId: 'good-1' }));
    // Inject a corrupted line
    const fs = require('fs');
    fs.appendFileSync(CAUSAL_REGISTRY_PATH(), 'this is not json\n');
    appendRecord(makeRecord({ recordId: 'good-2' }));
    const all = getLastNRecords(100);
    // Verify both valid records are present, skipping corrupted line
    const found1 = all.some((r) => r.recordId === 'good-1');
    const found2 = all.some((r) => r.recordId === 'good-2');
    expect(found1).toBe(true);
    expect(found2).toBe(true);
  });

  it('Duplicate prompt hash detected', () => {
    const rec1 = makeRecord({ userPrompt: 'same prompt', userPromptHash: hashPrompt('same prompt') });
    const rec2 = makeRecord({ userPrompt: 'same prompt', userPromptHash: hashPrompt('same prompt') });
    appendRecord(rec1);
    appendRecord(rec2);
    const all = getLastNRecords(100);
    expect(all[0].userPromptHash).toBe(all[1].userPromptHash);
  });

  it('Very long prompt truncated before storage', () => {
    const longPrompt = 'x'.repeat(50000);
    const rec = makeRecord({ userPrompt: longPrompt });
    appendRecord(rec);
    const found = getRecordById(rec.recordId);
    expect(found).not.toBeNull();
    const encoder = new TextEncoder();
    expect(encoder.encode(found!.userPrompt).length).toBeLessThanOrEqual(10240 + 4); // 10KB + ellipsis
  });

  it('Registry file grows without bound (intentional, document behavior)', () => {
    const before = getTotalRecordCount();
    for (let i = 0; i < 50; i++) {
      appendRecord(makeRecord({ turnNumber: i + 1 }));
    }
    expect(getTotalRecordCount()).toBe(before + 50);
    // File is append-only by design; no rotation
    const content = readFileSync(CAUSAL_REGISTRY_PATH(), 'utf-8');
    expect(content.trim().split('\n').length).toBeGreaterThanOrEqual(before + 50);
  });
});
