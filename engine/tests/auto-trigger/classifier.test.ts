import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../../src/auto-trigger/classifier';

describe('classifyIntent', () => {
  // ── Bug-fix tests ──
  it('detects bug-fix in English', () => {
    const r = classifyIntent('fix auth bug in login form');
    expect(r.taskType).toBe('bug-fix');
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it('detects bug-fix in Spanish', () => {
    const r = classifyIntent('arreglar falla en el dashboard');
    expect(r.taskType).toBe('bug-fix');
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it('detects crash-related bug', () => {
    const r = classifyIntent('app crashes when user clicks save');
    expect(r.taskType).toBe('bug-fix');
  });

  it('detects broken feature', () => {
    const r = classifyIntent('the payment button is broken');
    expect(r.taskType).toBe('bug-fix');
  });

  // ── Feature tests ──
  it('detects feature in English', () => {
    const r = classifyIntent('add dark mode to the app');
    expect(r.taskType).toBe('feature');
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it('detects feature in Spanish', () => {
    const r = classifyIntent('agregar nueva funcionalidad de búsqueda');
    expect(r.taskType).toBe('feature');
  });

  it('detects implement request', () => {
    const r = classifyIntent('implement JWT authentication');
    expect(r.taskType).toBe('feature');
  });

  // ── Refactor tests ──
  it('detects refactor', () => {
    const r = classifyIntent('refactor the user service to use DI');
    expect(r.taskType).toBe('refactor');
  });

  it('detects cleanup in Spanish', () => {
    const r = classifyIntent('limpiar código del módulo de pagos');
    expect(r.taskType).toBe('refactor');
  });

  // ── Typo tests ──
  it('detects typo', () => {
    const r = classifyIntent('fix typo in README');
    expect(r.taskType).toBe('typo');
  });

  it('detects spelling in Spanish', () => {
    const r = classifyIntent('corregir ortografía en la documentación');
    expect(r.taskType).toBe('typo');
  });

  it('detects comment fix', () => {
    const r = classifyIntent('update comments in auth module');
    expect(r.taskType).toBe('typo');
  });

  // ── Docs tests ──
  it('detects docs request', () => {
    const r = classifyIntent('document the API endpoints');
    expect(r.taskType).toBe('docs');
  });

  it('detects docs in Spanish', () => {
    const r = classifyIntent('documentar el módulo de autenticación');
    expect(r.taskType).toBe('docs');
  });

  // ── Security tests ──
  it('detects security/auth', () => {
    const r = classifyIntent('add password validation to login');
    expect(r.taskType).toBe('security');
  });

  it('detects security in Spanish', () => {
    const r = classifyIntent('mejorar seguridad de la contraseña');
    expect(r.taskType).toBe('security');
  });

  it('detects encryption request', () => {
    const r = classifyIntent('encrypt user data at rest');
    expect(r.taskType).toBe('security');
  });

  // ── Exploration tests ──
  it('detects exploration', () => {
    const r = classifyIntent('how does the caching layer work?');
    expect(r.taskType).toBe('exploration');
  });

  it('detects exploration in Spanish', () => {
    const r = classifyIntent('entender cómo funciona el pipeline');
    expect(r.taskType).toBe('exploration');
  });

  // ── Test tests ──
  it('detects test request', () => {
    const r = classifyIntent('add tests for the payment service');
    expect(r.taskType).toBe('test');
  });

  it('detects coverage request', () => {
    const r = classifyIntent('increase test coverage for auth');
    expect(r.taskType).toBe('test');
  });

  // ── Edge cases ──
  it('returns unknown for vague request', () => {
    const r = classifyIntent('do something');
    expect(r.taskType).toBe('unknown');
    expect(r.confidence).toBeLessThan(0.6);
  });

  it('returns unknown for empty request', () => {
    const r = classifyIntent('');
    expect(r.taskType).toBe('unknown');
  });

  it('extracts multiple keywords', () => {
    const r = classifyIntent('fix bug and add tests for auth');
    expect(r.keywords.length).toBeGreaterThanOrEqual(3);
  });

  it('security wins over bug-fix when both present', () => {
    const r = classifyIntent('fix security vulnerability in auth');
    // Both 'fix' and 'security' match; security has more weight due to keyword count
    expect(r.taskType).toBe('security');
  });
});
