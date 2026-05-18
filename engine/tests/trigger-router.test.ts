import { describe, it, expect } from 'vitest';
import { parseTrigger } from '../src/trigger-router';

describe('parseTrigger', () => {
  it('detects plan only', () => {
    const r = parseTrigger('plan only: fix auth bug');
    expect(r.type).toBe('plan-only');
    expect(r.cleanRequest).toBe('fix auth bug');
  });

  it('detects approved without scope', () => {
    const r = parseTrigger('[APPROVED]');
    expect(r.type).toBe('approved');
    expect(r.scope).toBeUndefined();
  });

  it('detects approved with scope', () => {
    const r = parseTrigger('[APPROVED] Phase A only');
    expect(r.type).toBe('approved');
    expect(r.scope).toBe('Phase A only');
  });

  it('detects reject with reason', () => {
    const r = parseTrigger('REJECT — too risky');
    expect(r.type).toBe('reject');
    expect(r.reason).toBe('too risky');
  });

  it('detects light', () => {
    const r = parseTrigger('light: fix typo');
    expect(r.type).toBe('light');
    expect(r.cleanRequest).toBe('fix typo');
  });

  it('detects challenge', () => {
    const r = parseTrigger('challenge: why 15 files?');
    expect(r.type).toBe('challenge');
    expect(r.subject).toBe('why 15 files?');
  });

  it('detects audit', () => {
    const r = parseTrigger('audit');
    expect(r.type).toBe('audit');
  });

  it('returns none for normal input', () => {
    const r = parseTrigger('fix auth bug');
    expect(r.type).toBe('none');
    expect(r.cleanRequest).toBe('fix auth bug');
  });
});
