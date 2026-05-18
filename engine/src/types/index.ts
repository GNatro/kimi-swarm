/**
 * Kimi Swarm Engine — Core Types
 * Version: 0.3.0-project-agnostic
 */

import type { WorkerPrompt } from '../delegator/index.js';

/** Represents a single file in the project with token estimation */
export interface ProjectFile {
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
  estimatedTokens: number;
  // Symbols extracted by Serena (optional, populated when available)
  symbols?: string[];
}

/** Represents a service/domain within the project */
export interface ServiceDomain {
  name: string;
  path: string;
  files: ProjectFile[];
  totalTokens: number;
  // Services this one imports from (dependencies)
  importsFrom: string[];
  // Services that import this one (dependents)
  importedBy: string[];
  // Cross-cutting files needed (types, core utils)
  sharedDependencies: string[];
}

/** Complete map of a project for partitioning decisions */
export interface ProjectMap {
  projectName: string;
  projectRoot: string;
  totalFiles: number;
  totalTokens: number;
  services: ServiceDomain[];
  shared: {
    core: ProjectFile[];
    types: ProjectFile[];
    tests: ProjectFile[];
    scripts: ProjectFile[];
    totalTokens: number;
  };
  generatedAt: string;
}

/** A chunk of context ready to be sent to a worker */
export interface ContextChunk {
  chunkId: string;
  estimatedTokens: number;
  files: string[]; // relative paths
  services: string[]; // service names included
  sharedFiles: string[]; // core/types needed
  description: string;
}

/** Classification of a user request */
export type TaskType =
  | 'bug-fix'
  | 'feature-implementation'
  | 'refactor'
  | 'exploration'
  | 'testing'
  | 'documentation'
  | 'cross-cutting'; // requires multiple services

/** A task ready for delegation */
export interface TaskBrief {
  taskId: string;
  project: string;
  taskType: TaskType;
  objective: string;
  userRequest: string;
  contextChunks: ContextChunk[];
  // If no partitioning needed, direct files
  directFiles?: string[];
  constraints: string[];
  successCriteria: string[];
  estimatedTotalTokens: number;
  requiresPartitioning: boolean;
  // For partitioned tasks
  subtasks?: Subtask[];
}

/** A subtask derived from partitioning */
export interface Subtask {
  subtaskId: string;
  workerType: 'coder' | 'explore' | 'plan';
  objective: string;
  contextChunk: ContextChunk;
  dependencies: string[]; // subtaskIds that must complete first
  inputArtifacts: string[];
  expectedOutput: string;
  successCriteria: string[];
}

/** Result returned by a worker */
export interface WorkerResult {
  subtaskId: string;
  workerType: string;
  status: 'completed' | 'partial' | 'blocked' | 'failed';
  summary: string;
  changesMade: string[];
  technicalNotes: string;
  testsValidation: string;
  filesModified: { path: string; action: 'modified' | 'created' | 'deleted' }[];
  contextUsed: {
    briefTokens: number;
    contextWindowStart: number;
    contextWindowEnd: number;
  };
  nextSteps: string[];
  timestamp: string;
}

/** Integration plan after all workers complete */
export interface IntegrationPlan {
  taskId: string;
  results: WorkerResult[];
  conflicts: Conflict[];
  applyOrder: string[];
  validationSteps: string[];
}

export interface Conflict {
  files: string[];
  description: string;
  severity: 'low' | 'medium' | 'high';
  resolution?: string;
}

/** Configuration for the engine */
export interface EngineConfig {
  // Max tokens per context chunk (worker input)
  maxChunkTokens: number;
  // Safety margin — leave this much headroom in each chunk
  chunkSafetyMargin: number;
  // Max tokens before we force partitioning
  partitionThreshold: number;
  // Project root (agnostic, was polybotRoot)
  projectRoot: string;
  // Where to write task files
  busRoot: string;
  // Project identifier
  projectId: string;
  // Detected language
  language: string;
  // Service patterns for this language
  servicePatterns: string[];

}

/** Options for the orchestrate function */
export interface OrchestrateOptions {
  /** If true, run partitioner but do NOT write to bus. Show preview only. */
  dryRun?: boolean;
  /** If true, the plan has been approved. Write to bus normally. */
  approved?: boolean;
  /** If true, skip swarm partitioning entirely. Direct execution mode. */
  light?: boolean;
  /** Scope for partial approval (e.g., "Phase A only") */
  scope?: string;
}

/** Extended result that includes dry-run information */
export interface OrchestrateResult {
  brief: TaskBrief;
  prompts: WorkerPrompt[];
  /** Only present in dry-run mode */
  dryRun?: boolean;
  /** Only present if plan is pending approval */
  pendingApproval?: boolean;
}

export const DEFAULT_CONFIG: EngineConfig = {
  maxChunkTokens: 150_000,
  chunkSafetyMargin: 20_000,
  partitionThreshold: 120_000,
  projectRoot: process.cwd(),
  busRoot: `/home/grapho/shared-context/default`,
  projectId: 'default',
  language: 'typescript',
  servicePatterns: ['src/**/*'],
};

// Re-export Soul & Swarm types
export type {
  SoulManifest,
  SoulFileTouch,
  SoulExportOptions,
  SoulExportResult,
  SoulImportOptions,
  SoulImportResult,
  SoulPreview,
  SoulRegistry,
  FileLock,
  LockConflict,
  LockAcquireResult,
  V1V8Result,
  EliteConstitution,
} from '../soul/types.js';
