import { describe, it, expect } from 'vitest';
import { estimateScope } from '../../src/auto-trigger/scope-estimator';
import type { ProjectMap } from '../../src/types/index.js';

const mockMap: ProjectMap = {
  projectName: 'test',
  projectRoot: '/test',
  totalFiles: 20,
  totalTokens: 50_000,
  services: [
    {
      name: 'auth',
      path: '/test/src/auth',
      files: [
        { relativePath: 'src/auth/login.ts', absolutePath: '/test/src/auth/login.ts', sizeBytes: 1000, estimatedTokens: 250 },
        { relativePath: 'src/auth/jwt.ts', absolutePath: '/test/src/auth/jwt.ts', sizeBytes: 800, estimatedTokens: 200 },
      ],
      totalTokens: 450,
      importsFrom: [],
      importedBy: ['dashboard'],
      sharedDependencies: [],
    },
    {
      name: 'dashboard',
      path: '/test/src/dashboard',
      files: [
        { relativePath: 'src/dashboard/index.ts', absolutePath: '/test/src/dashboard/index.ts', sizeBytes: 2000, estimatedTokens: 500 },
      ],
      totalTokens: 500,
      importsFrom: ['auth'],
      importedBy: [],
      sharedDependencies: [],
    },
  ],
  shared: {
    core: [],
    types: [],
    tests: [],
    scripts: [],
    totalTokens: 0,
  },
  generatedAt: new Date().toISOString(),
};

describe('estimateScope', () => {
  it('estimates typo as 1 file', () => {
    const r = estimateScope({ taskType: 'typo', keywords: ['readme'] });
    expect(r.estimatedFiles.avg).toBe(1);
    expect(r.estimatedFiles.min).toBe(1);
    expect(r.estimatedFiles.max).toBe(1);
  });

  it('estimates bug-fix as 1-3 files', () => {
    const r = estimateScope({ taskType: 'bug-fix', keywords: ['error'] });
    expect(r.estimatedFiles.avg).toBe(2);
    expect(r.estimatedFiles.min).toBe(1);
    expect(r.estimatedFiles.max).toBe(3);
  });

  it('estimates feature as 3-10 files', () => {
    const r = estimateScope({ taskType: 'feature', keywords: ['add'] });
    expect(r.estimatedFiles.avg).toBe(5);
    expect(r.estimatedFiles.min).toBe(3);
    expect(r.estimatedFiles.max).toBe(10);
  });

  it('estimates refactor as 5-20 files', () => {
    const r = estimateScope({ taskType: 'refactor', keywords: ['clean'] });
    expect(r.estimatedFiles.avg).toBe(8);
    expect(r.estimatedFiles.min).toBe(5);
    expect(r.estimatedFiles.max).toBe(20);
  });

  it('estimates security as 2-8 files', () => {
    const r = estimateScope({ taskType: 'security', keywords: ['auth'] });
    expect(r.estimatedFiles.avg).toBe(4);
    expect(r.estimatedFiles.min).toBe(2);
    expect(r.estimatedFiles.max).toBe(8);
  });

  it('finds relevant services from project map', () => {
    const r = estimateScope({ taskType: 'bug-fix', keywords: ['auth'], projectMap: mockMap });
    expect(r.relevantServices).toContain('auth');
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it('finds services by file name match', () => {
    const r = estimateScope({ taskType: 'bug-fix', keywords: ['login'], projectMap: mockMap });
    expect(r.relevantServices).toContain('auth');
  });

  it('adjusts for auth feature (+2 files)', () => {
    const r = estimateScope({ taskType: 'feature', keywords: ['auth', 'login'], projectMap: mockMap });
    expect(r.estimatedFiles.avg).toBeGreaterThanOrEqual(5);
  });

  it('estimates tokens based on files', () => {
    const r = estimateScope({ taskType: 'feature', keywords: ['add'] });
    expect(r.estimatedTokens).toBe(r.estimatedFiles.avg * 400);
  });

  it('requires partitioning when tokens > threshold', () => {
    const r = estimateScope({
      taskType: 'refactor',
      keywords: ['all'],
      partitionThreshold: 1000,
    });
    expect(r.requiresPartitioning).toBe(true);
  });

  it('does not require partitioning for small tasks', () => {
    const r = estimateScope({ taskType: 'typo', keywords: ['readme'] });
    expect(r.requiresPartitioning).toBe(false);
  });

  it('returns empty services when no project map', () => {
    const r = estimateScope({ taskType: 'bug-fix', keywords: ['auth'] });
    expect(r.relevantServices).toEqual([]);
    expect(r.confidence).toBeLessThan(0.5);
  });

  it('returns empty services when no match', () => {
    const r = estimateScope({ taskType: 'bug-fix', keywords: ['nonexistent'], projectMap: mockMap });
    expect(r.relevantServices).toEqual([]);
  });

  it('estimates exploration as 0 files', () => {
    const r = estimateScope({ taskType: 'exploration', keywords: ['understand'] });
    expect(r.estimatedFiles.avg).toBe(0);
  });

  it('handles unknown task type gracefully', () => {
    const r = estimateScope({ taskType: 'unknown', keywords: ['something'] });
    expect(r.estimatedFiles.avg).toBe(2);
    expect(r.estimatedFiles.min).toBe(1);
    expect(r.estimatedFiles.max).toBe(5);
  });
});
