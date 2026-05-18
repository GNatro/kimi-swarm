import { describe, it, expect } from 'vitest';
import { calculateRiskAndComplexity } from '../../src/auto-trigger/risk-classifier';
import type { ScopeResult } from '../../src/auto-trigger/scope-estimator';

function makeScope(avgFiles: number): ScopeResult {
  return {
    estimatedFiles: { min: 1, max: avgFiles * 2, avg: avgFiles },
    estimatedServices: 1,
    estimatedTokens: avgFiles * 400,
    requiresPartitioning: false,
    relevantServices: [],
    confidence: 0.7,
  };
}

describe('calculateRiskAndComplexity', () => {
  // ── Probability tests ──
  it('base probability is 2', () => {
    const r = calculateRiskAndComplexity({
      rawRequest: 'fix typo',
      taskType: 'typo',
      keywords: ['typo'],
      scope: makeScope(1),
    });
    expect(r.risk.probability).toBe(2);
  });

  it('refactor increases probability', () => {
    const r = calculateRiskAndComplexity({
      rawRequest: 'refactor user service',
      taskType: 'refactor',
      keywords: ['refactor'],
      scope: makeScope(8),
    });
    expect(r.risk.probability).toBeGreaterThanOrEqual(3);
  });

  it('security increases probability', () => {
    const r = calculateRiskAndComplexity({
      rawRequest: 'add password validation',
      taskType: 'security',
      keywords: ['password'],
      scope: makeScope(4),
    });
    expect(r.risk.probability).toBeGreaterThanOrEqual(3);
  });

  it('many files increases probability', () => {
    const r = calculateRiskAndComplexity({
      rawRequest: 'refactor all services',
      taskType: 'refactor',
      keywords: ['refactor'],
      scope: makeScope(15),
    });
    expect(r.risk.probability).toBe(5);
  });

  // ── Impact tests ──
  it('auth keywords increase impact', () => {
    const r = calculateRiskAndComplexity({
      rawRequest: 'fix auth bug',
      taskType: 'bug-fix',
      keywords: ['auth', 'login'],
      scope: makeScope(2),
    });
    expect(r.risk.impact).toBe(4); // 2 base + 2 auth (bug-fix gets reduced weight)
  });

  it('payment keywords increase impact', () => {
    const r = calculateRiskAndComplexity({
      rawRequest: 'fix payment bug',
      taskType: 'bug-fix',
      keywords: ['payment', 'billing'],
      scope: makeScope(2),
    });
    expect(r.risk.impact).toBe(5); // 2 base + 3 payment
  });

  it('production increases impact', () => {
    const r = calculateRiskAndComplexity({
      rawRequest: 'fix bug',
      taskType: 'bug-fix',
      keywords: ['fix'],
      scope: makeScope(2),
      isProduction: true,
    });
    expect(r.risk.impact).toBe(4); // 2 base + 2 production
  });

  // ── Risk score tests ──
  it('typo is low risk', () => {
    const r = calculateRiskAndComplexity({
      rawRequest: 'fix typo in readme',
      taskType: 'typo',
      keywords: ['typo'],
      scope: makeScope(1),
    });
    expect(r.risk.riskScore).toBeLessThan(9);
    expect(r.risk.isHighRisk).toBe(false);
  });

  it('auth feature is high risk', () => {
    const r = calculateRiskAndComplexity({
      rawRequest: 'implement authentication with JWT for the login system',
      taskType: 'feature',
      keywords: ['auth', 'jwt'],
      scope: makeScope(6),
    });
    expect(r.risk.riskScore).toBeGreaterThanOrEqual(13);
    expect(r.risk.isHighRisk).toBe(true);
  });

  it('includes risk factors for high risk', () => {
    const r = calculateRiskAndComplexity({
      rawRequest: 'implement authentication',
      taskType: 'security',
      keywords: ['auth', 'password'],
      scope: makeScope(6),
      isProduction: true,
    });
    expect(r.risk.riskFactors.length).toBeGreaterThan(0);
    expect(r.risk.riskFactors).toContain('Authentication-related changes');
    expect(r.risk.riskFactors).toContain('Production environment');
  });

  // ── Complexity tests ──
  it('typo is trivial', () => {
    const r = calculateRiskAndComplexity({
      rawRequest: 'fix typo',
      taskType: 'typo',
      keywords: ['typo'],
      scope: makeScope(1),
    });
    expect(r.complexity.isTrivial).toBe(true);
    expect(r.complexity.complexityScore).toBeLessThanOrEqual(2);
  });

  it('long request increases complexity', () => {
    const r = calculateRiskAndComplexity({
      rawRequest: 'a'.repeat(250),
      taskType: 'feature',
      keywords: ['add'],
      scope: makeScope(3),
    });
    expect(r.complexity.complexityScore).toBeGreaterThanOrEqual(5);
  });

  it('many files increases complexity', () => {
    const r = calculateRiskAndComplexity({
      rawRequest: 'refactor all services',
      taskType: 'refactor',
      keywords: ['refactor'],
      scope: makeScope(10),
    });
    expect(r.complexity.isComplex).toBe(true);
  });

  it('broad scope keywords increase complexity', () => {
    const r = calculateRiskAndComplexity({
      rawRequest: 'refactor all the code everywhere in the entire application including tests',
      taskType: 'refactor',
      keywords: ['refactor', 'all'],
      scope: makeScope(6),
    });
    expect(r.complexity.complexityScore).toBeGreaterThanOrEqual(7);
  });

  it('multi-task keywords increase complexity', () => {
    const r = calculateRiskAndComplexity({
      rawRequest: 'fix bug and also add feature plus update the documentation files',
      taskType: 'feature',
      keywords: ['fix', 'add'],
      scope: makeScope(6),
    });
    expect(r.complexity.complexityScore).toBeGreaterThanOrEqual(7);
  });

  it('exploration is simple', () => {
    const r = calculateRiskAndComplexity({
      rawRequest: 'how does caching work?',
      taskType: 'exploration',
      keywords: ['understand'],
      scope: makeScope(0),
    });
    expect(r.complexity.isSimple).toBe(true);
  });
});
