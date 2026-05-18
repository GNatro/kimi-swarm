import { describe, it, expect } from 'vitest';
import { runAutoDetection } from '../../src/auto-trigger/router';

describe('runAutoDetection', () => {
  it('auto-detects typo as light mode', async () => {
    const d = await runAutoDetection('fix typo in README');
    expect(d.mode).toBe('light');
    expect(d.taskType).toBe('typo');
    expect(d.confidence).toBeGreaterThan(0.5);
  });

  it('auto-detects comment fix as light mode', async () => {
    const d = await runAutoDetection('update comments in auth module');
    expect(d.mode).toBe('light');
  });

  it('auto-detects exploration as normal mode', async () => {
    const d = await runAutoDetection('how does the caching layer work?');
    expect(d.mode).toBe('normal');
    expect(d.taskType).toBe('exploration');
  });

  it('auto-detects auth as challenge mode', async () => {
    const d = await runAutoDetection('implement JWT authentication');
    expect(d.mode).toBe('challenge');
    expect(d.riskScore).toBeGreaterThanOrEqual(13);
  });

  it('auto-detects password as challenge mode', async () => {
    const d = await runAutoDetection('add password reset feature');
    expect(d.mode).toBe('challenge');
  });

  it('auto-detects large feature as plan-only', async () => {
    const d = await runAutoDetection('implement full user dashboard with charts and analytics');
    expect(d.mode).toBe('plan-only');
  });

  it('auto-detects multi-service refactor as plan-only', async () => {
    const d = await runAutoDetection('refactor all services to use new logger');
    expect(d.mode).toBe('plan-only');
  });

  it('auto-detects simple bug fix as normal mode', async () => {
    const d = await runAutoDetection('fix login button color');
    expect(d.mode).toBe('normal');
  });

  it('includes explanation for all modes', async () => {
    const d = await runAutoDetection('fix typo');
    expect(d.explanation.length).toBeGreaterThan(10);
    expect(d.reason.length).toBeGreaterThan(5);
  });

  it('provides risk score for auth tasks', async () => {
    const d = await runAutoDetection('implement authentication with JWT');
    expect(d.riskScore).toBeGreaterThanOrEqual(10);
  });

  it('provides complexity score', async () => {
    const d = await runAutoDetection('fix typo in README');
    expect(d.complexityScore).toBeLessThanOrEqual(2);
  });
});
