import { describe, it, expect } from 'vitest';
import { sumTokens, formatTokens } from '../src/utils/token-estimator.js';
import {
  identifyRelevantServices,
  isBroadAnalysisTask,
  type PartitionRequest,
} from '../src/partitioner/index.js';
import { generateWorkerPrompt } from '../src/delegator/index.js';
import {
  findPendingTasks,
  parseWorkerResult,
} from '../src/integration/auto-integrate.js';
import type { ProjectMap, ServiceDomain, TaskBrief, Subtask } from '../src/types/index.js';

// ─── Mock Project Map ───
const mockMap: ProjectMap = {
  projectName: 'polybot',
  projectRoot: '/test',
  totalFiles: 100,
  totalTokens: 500_000,
  services: [
    {
      name: 'telegram',
      path: '/test/src/services/telegram',
      files: [
        { relativePath: 'src/services/telegram/bot.ts', absolutePath: '/test/src/services/telegram/bot.ts', sizeBytes: 1000, estimatedTokens: 250 },
        { relativePath: 'src/services/telegram/daily-summary.ts', absolutePath: '/test/src/services/telegram/daily-summary.ts', sizeBytes: 1000, estimatedTokens: 250 },
      ],
      totalTokens: 500,
      importsFrom: [],
      importedBy: [],
      sharedDependencies: [],
    },
    {
      name: 'dashboard',
      path: '/test/src/services/dashboard',
      files: [
        { relativePath: 'src/services/dashboard/index.ts', absolutePath: '/test/src/services/dashboard/index.ts', sizeBytes: 2000, estimatedTokens: 500 },
      ],
      totalTokens: 500,
      importsFrom: [],
      importedBy: [],
      sharedDependencies: [],
    },
    {
      name: 'tui',
      path: '/test/src/tui',
      files: [
        { relativePath: 'src/tui/app.tsx', absolutePath: '/test/src/tui/app.tsx', sizeBytes: 1500, estimatedTokens: 375 },
      ],
      totalTokens: 375,
      importsFrom: [],
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

// ─── Utils Tests ───
describe('token-estimator', () => {
  it('sums tokens correctly', () => {
    expect(sumTokens([{ estimatedTokens: 100 }, { estimatedTokens: 200 }] as any)).toBe(300);
  });

  it('formats tokens in human readable form', () => {
    expect(formatTokens(500)).toBe('500');
    expect(formatTokens(1500)).toBe('1.5k');
    expect(formatTokens(1_500_000)).toBe('1500.0k');
  });
});

// ─── Partitioner Tests ───
describe('partitioner', () => {
  it('identifies relevant services by keyword', () => {
    const request: PartitionRequest = { userRequest: 'Fix telegram bot message handler' };
    const relevant = identifyRelevantServices(mockMap, request);
    expect(relevant.map((s) => s.name)).toContain('telegram');
    expect(relevant.length).toBeGreaterThanOrEqual(1);
  });

  it('identifies dashboard service', () => {
    const request: PartitionRequest = { userRequest: 'Fix dashboard onPause bug' };
    const relevant = identifyRelevantServices(mockMap, request);
    expect(relevant.map((s) => s.name)).toContain('dashboard');
  });

  it('detects broad analysis tasks', () => {
    expect(isBroadAnalysisTask('Complete analysis of the project')).toBe(true);
    expect(isBroadAnalysisTask('Audit all services')).toBe(true);
    expect(isBroadAnalysisTask('Fix telegram bug')).toBe(false);
    expect(isBroadAnalysisTask('Add feature X')).toBe(false);
  });

  it('detects broad analysis in Spanish', () => {
    expect(isBroadAnalysisTask('Análisis completo del proyecto')).toBe(true);
    expect(isBroadAnalysisTask('Estado actual del sistema')).toBe(true);
  });

  it('returns empty for vague non-analysis tasks', () => {
    const request: PartitionRequest = { userRequest: 'Do something' };
    const relevant = identifyRelevantServices(mockMap, request);
    expect(relevant.length).toBe(0);
  });
});

// ─── Delegator Tests ───
describe('delegator', () => {
  it('generates worker prompt with all required sections', () => {
    const brief: TaskBrief = {
      taskId: 'task-test',
      project: 'polybot',
      taskType: 'bug-fix',
      objective: 'Fix bug',
      userRequest: 'Fix bug in X',
      contextChunks: [{
        chunkId: 'chunk-1',
        estimatedTokens: 1000,
        files: ['src/services/telegram/bot.ts'],
        services: ['telegram'],
        sharedFiles: [],
        description: 'telegram service',
      }],
      constraints: ['Do not break tests'],
      successCriteria: ['Build passes'],
      estimatedTotalTokens: 1000,
      requiresPartitioning: false,
    };

    const subtask: Subtask = {
      subtaskId: 'task-test-single',
      workerType: 'coder',
      objective: 'Fix bug in X',
      contextChunk: brief.contextChunks[0],
      dependencies: [],
      inputArtifacts: ['src/services/telegram/bot.ts'],
      expectedOutput: 'Fixed code',
      successCriteria: ['Build passes'],
    };

    const prompt = generateWorkerPrompt(brief, subtask, {
      maxChunkTokens: 150_000,
      chunkSafetyMargin: 20_000,
      partitionThreshold: 120_000,
      polybotRoot: '/test',
      busRoot: '/test-bus',
    });

    expect(prompt.subtaskId).toBe('task-test-single');
    expect(prompt.workerType).toBe('coder');
    expect(prompt.prompt).toContain('Worker Brief');
    expect(prompt.prompt).toContain('Fix bug in X');
    expect(prompt.prompt).toContain('MANDATORY');
    expect(prompt.prompt).toContain('Checkpoint');
    expect(prompt.prompt).toContain('Delivery Instructions');
    expect(prompt.filesToRead.length).toBe(1);
    expect(prompt.resultPath).toContain('task-test-single-result.md');
  });
});

// ─── Integration Tests ───
describe('integration', () => {
  it('parses worker result from markdown', () => {
    const md = `# Worker Report: task-123

## Summary
Fixed the bug.

## Changes Made
- Fixed bug in bot.ts
- Updated tests

## Files Modified
- src/bot.ts: modified

## Tests / Validation
- All tests pass
`;

    const result = parseWorkerResult(md, 'task-123');
    expect(result.subtaskId).toBe('task-123');
    expect(result.status).toBe('completed');
    expect(result.summary).toContain('Fixed the bug');
    expect(result.changesMade).toHaveLength(2);
    expect(result.filesModified).toHaveLength(1);
    expect(result.filesModified[0].path).toBe('src/bot.ts');
    expect(result.filesModified[0].action).toBe('modified');
  });

  it('detects partial status', () => {
    const md = `Status: partial\n\n## Summary\nCould not finish.`;
    const result = parseWorkerResult(md, 'task-123');
    expect(result.status).toBe('partial');
  });

  it('detects failed status', () => {
    const md = `Status: failed\n\n## Summary\nTests failed.`;
    const result = parseWorkerResult(md, 'task-123');
    expect(result.status).toBe('failed');
  });
});
