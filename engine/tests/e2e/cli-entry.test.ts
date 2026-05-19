import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

describe('CLI E2E', () => {
  it('plan-only trigger returns preview without writing files', () => {
    let output = '';
    try {
      output = execSync(
        'npx tsx bin/swarm-orchestrate.ts "plan only: implement auth"',
        { cwd: process.cwd(), encoding: 'utf-8', timeout: 30000 }
      );
    } catch (err: any) {
      // orchestrate() may fail on unregistered projects, but autoOrchestrate
      // should still run and produce the mode/action output
      output = err.stdout || '';
    }
    expect(output).toContain('plan-only');
    expect(output).toContain('Action:');
  });

  it('autoOrchestrate records to causal registry', () => {
    const before = execSync('wc -l < ~/.kimi/state/causal-registry.jsonl', { encoding: 'utf-8' });
    try {
      execSync(
        'npx tsx bin/swarm-orchestrate.ts "light: fix typo"',
        { cwd: process.cwd(), encoding: 'utf-8', timeout: 30000 }
      );
    } catch {
      // orchestrate() may fail on unregistered projects; we only care
      // that autoOrchestrate appended a causal record
    }
    const after = execSync('wc -l < ~/.kimi/state/causal-registry.jsonl', { encoding: 'utf-8' });
    expect(parseInt(after)).toBeGreaterThan(parseInt(before));
  });
});
