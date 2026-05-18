import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const TEST_DIR = mkdtempSync(join(tmpdir(), 'auto-orchestrate-test-'));
process.env.HOME = TEST_DIR;

const {
  CAUSAL_REGISTRY_PATH,
  PLAN_GRAPH_PATH,
} = await import('../../src/anti-drift/types.js');

describe('auto-orchestrate', () => {
  beforeEach(() => {
    [CAUSAL_REGISTRY_PATH(), PLAN_GRAPH_PATH()].forEach((p) => {
      try {
        rmSync(p, { recursive: true, force: true });
      } catch {}
    });
  });

  it('autoOrchestrate returns mode and action for orchestrator', async () => {
    const { autoOrchestrate } = await import('../../src/auto-orchestrate.js');
    const result = await autoOrchestrate('plan only: test feature', 'orchestrator');
    expect(result.mode).toBeDefined();
    expect(result.action).toBeDefined();
    expect(result.context).toBeDefined();
  });

  it('autoOrchestrate detects plan-only trigger', async () => {
    const { autoOrchestrate } = await import('../../src/auto-orchestrate.js');
    const result = await autoOrchestrate('plan only: implement auth', 'orchestrator');
    expect(result.mode).toBe('plan-only');
  });

  it('autoOrchestrate detects light trigger', async () => {
    const { autoOrchestrate } = await import('../../src/auto-orchestrate.js');
    const result = await autoOrchestrate('light: fix typo', 'orchestrator');
    expect(result.mode).toBe('light');
  });

  it('autoOrchestrate detects approved trigger', async () => {
    const { autoOrchestrate } = await import('../../src/auto-orchestrate.js');
    const result = await autoOrchestrate('[APPROVED]', 'orchestrator');
    expect(result.mode).toBe('approved');
  });

  it('autoOrchestrate detects reject trigger', async () => {
    const { autoOrchestrate } = await import('../../src/auto-orchestrate.js');
    const result = await autoOrchestrate('REJECT — too complex', 'orchestrator');
    expect(result.mode).toBe('reject');
  });

  it('autoOrchestrate records prompt in causal registry', async () => {
    const { autoOrchestrate } = await import('../../src/auto-orchestrate.js');
    const { getTotalRecordCount } = await import('../../src/anti-drift/causal-registry.js');

    const before = getTotalRecordCount();
    await autoOrchestrate('light: test prompt recording', 'orchestrator');
    const after = getTotalRecordCount();

    expect(after).toBe(before + 1);
  });

  it('autoOrchestrate worker action is wait for work order', async () => {
    const { autoOrchestrate } = await import('../../src/auto-orchestrate.js');
    const result = await autoOrchestrate('Any task', 'worker');
    expect(result.action).toContain('WORK ORDER');
  });

  it('autoOrchestrate orchestrator plan-only action is correct', async () => {
    const { autoOrchestrate } = await import('../../src/auto-orchestrate.js');
    const result = await autoOrchestrate('plan only: test', 'orchestrator');
    expect(result.action).toContain('dry-run');
  });

  it('autoOrchestrate orchestrator challenge action is correct', async () => {
    const { autoOrchestrate } = await import('../../src/auto-orchestrate.js');
    const result = await autoOrchestrate('challenge: auth system', 'orchestrator');
    expect(result.action).toContain('6-Lens');
  });

  it('autoOrchestrate with no trigger auto-detects', async () => {
    const { autoOrchestrate } = await import('../../src/auto-orchestrate.js');
    const result = await autoOrchestrate('implement a small feature', 'orchestrator');
    expect(result.mode).toBeDefined();
    expect(result.mode).not.toBe('none');
  });
});
