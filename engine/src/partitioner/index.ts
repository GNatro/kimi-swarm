/**
 * Context Partitioner
 * Decides whether a task needs partitioning and creates optimal context chunks.
 */

import type {
  ProjectMap,
  ServiceDomain,
  ContextChunk,
  TaskBrief,
  TaskType,
  Subtask,
  EngineConfig,
} from '../types/index.js';
import { DEFAULT_CONFIG } from '../types/index.js';
import { sumTokens, formatTokens } from '../utils/token-estimator.js';

export { DEFAULT_CONFIG };

/** Input to the partitioner */
export interface PartitionRequest {
  userRequest: string;
  // Explicit files mentioned by user (optional)
  explicitFiles?: string[];
  // Explicit services mentioned by user (optional)
  explicitServices?: string[];
  // Task type hint
  taskTypeHint?: TaskType;
  // If true, only include explicitly mentioned services (strict mode)
  strictScope?: boolean;
}

/** Result of partitioning */
export interface PartitionResult {
  needsPartitioning: boolean;
  reason: string;
  estimatedTokens: number;
  chunks: ContextChunk[];
  // Recommended worker type for each chunk
  workerRecommendations: string[];
}

/** Load the polybot map */
export async function loadProjectMap(): Promise<ProjectMap> {
  const { default: map } = await import('../polybot-context/map.json', {
    assert: { type: 'json' },
  });
  return map as ProjectMap;
}

/** Identify which services are relevant to a request */
export function identifyRelevantServices(
  map: ProjectMap,
  request: PartitionRequest
): ServiceDomain[] {
  const relevant: ServiceDomain[] = [];

  // 1. Explicit services (highest priority)
  if (request.explicitServices) {
    for (const name of request.explicitServices) {
      const svc = map.services.find((s) => s.name === name);
      if (svc) relevant.push(svc);
    }
    // In strict mode, only return explicit services
    if (request.strictScope && relevant.length > 0) {
      return relevant;
    }
  }

  // 2. Explicit files -> derive services
  if (request.explicitFiles) {
    for (const file of request.explicitFiles) {
      for (const svc of map.services) {
        if (svc.files.some((f) => f.relativePath.includes(file))) {
          if (!relevant.includes(svc)) relevant.push(svc);
        }
      }
    }
    if (request.strictScope && relevant.length > 0) {
      return relevant;
    }
  }

  // 3. Keyword matching — require at least 2 keyword matches for inclusion
  // (reduces false positives)
  const keywords = extractKeywords(request.userRequest);
  const keywordSet = new Set(keywords);

  for (const svc of map.services) {
    // Skip if already added explicitly
    if (relevant.includes(svc)) continue;

    const svcKeywords = [
      svc.name,
      ...svc.name.split('-'),
      ...svc.files.map((f) => {
        const base = f.relativePath.split('/').pop() || '';
        return base.replace('.ts', '').replace('.test', '');
      }),
    ];

    let matchCount = 0;
    for (const kw of keywordSet) {
      if (svcKeywords.some((sk) => sk.toLowerCase().includes(kw.toLowerCase()))) {
        matchCount++;
      }
    }

    // Require at least 2 keyword matches OR exact service name match
    const exactNameMatch = keywordSet.has(svc.name) || keywordSet.has(svc.name.replace(/-/g, ''));
    if (exactNameMatch || matchCount >= 2) {
      relevant.push(svc);
    }
  }

  // 4. Sort by relevance (exact matches first, then by token count)
  return relevant.sort((a, b) => {
    const aExact = keywordSet.has(a.name) ? 1 : 0;
    const bExact = keywordSet.has(b.name) ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    return b.totalTokens - a.totalTokens;
  });
}

/** Extract keywords from a user request */
function extractKeywords(request: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'and', 'or',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
    'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his',
    'fix', 'bug', 'implement', 'add', 'create', 'update', 'refactor', 'test',
    'change', 'modify', 'remove', 'delete', 'improve', 'optimize', 'check',
    'please', 'need', 'want', 'should', 'must', 'make', 'sure', 'new',
  ]);

  return request
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

/** Create context chunks from relevant services */
export function createChunks(
  map: ProjectMap,
  services: ServiceDomain[],
  config: EngineConfig = DEFAULT_CONFIG
): ContextChunk[] {
  const limit = config.maxChunkTokens - config.chunkSafetyMargin; // 130k effective
  const chunks: ContextChunk[] = [];

  // Always include shared types (small, essential)
  const sharedTypesTokens = sumTokens(map.shared.types);
  const sharedCoreTokens = sumTokens(map.shared.core);

  // Strategy: group services into chunks that fit under the limit
  let currentChunk: ContextChunk = {
    chunkId: `chunk-${chunks.length + 1}`,
    estimatedTokens: sharedTypesTokens,
    files: map.shared.types.map((f) => f.relativePath),
    services: [],
    sharedFiles: map.shared.types.map((f) => f.relativePath),
    description: '',
  };

  for (const svc of services) {
    const svcWithDeps = svc.totalTokens + estimateDepsTokens(svc, map);

    // If this service alone (+ shared) exceeds limit, it needs its own chunk
    if (currentChunk.estimatedTokens + svcWithDeps > limit) {
      // Finalize current chunk
      if (currentChunk.services.length > 0) {
        chunks.push(finalizeChunk(currentChunk));
      }
      // Start new chunk with this service
      currentChunk = {
        chunkId: `chunk-${chunks.length + 1}`,
        estimatedTokens: sharedTypesTokens + svcWithDeps,
        files: [
          ...map.shared.types.map((f) => f.relativePath),
          ...svc.files.map((f) => f.relativePath),
        ],
        services: [svc.name],
        sharedFiles: map.shared.types.map((f) => f.relativePath),
        description: `Service: ${svc.name}`,
      };
    } else {
      // Add to current chunk
      currentChunk.estimatedTokens += svcWithDeps;
      currentChunk.files.push(...svc.files.map((f) => f.relativePath));
      currentChunk.services.push(svc.name);
      currentChunk.description += (currentChunk.description ? ', ' : '') + svc.name;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.services.length > 0) {
    chunks.push(finalizeChunk(currentChunk));
  }

  // If only one chunk and it's small enough, merge core files in
  if (chunks.length === 1 && chunks[0].estimatedTokens + sharedCoreTokens < limit) {
    chunks[0].files.push(...map.shared.core.map((f) => f.relativePath));
    chunks[0].sharedFiles.push(...map.shared.core.map((f) => f.relativePath));
    chunks[0].estimatedTokens += sharedCoreTokens;
  }

  return chunks;
}

/** Estimate additional tokens for a service's dependencies */
function estimateDepsTokens(svc: ServiceDomain, map: ProjectMap): number {
  let extra = 0;
  for (const depName of svc.importsFrom) {
    const dep = map.services.find((s) => s.name === depName);
    if (dep) {
      // Only count a fraction of dependency (interfaces/types, not full implementation)
      extra += Math.ceil(dep.totalTokens * 0.15);
    }
  }
  return extra;
}

function finalizeChunk(chunk: ContextChunk): ContextChunk {
  chunk.description = chunk.description || 'Shared context';
  chunk.files = [...new Set(chunk.files)]; // dedupe
  chunk.estimatedTokens = Math.ceil(chunk.estimatedTokens);
  return chunk;
}

/** Detect if the user wants a broad analysis of the entire project */
export function isBroadAnalysisTask(request: string): boolean {
  const analysisKeywords = [
    'analisis', 'análisis', 'analysis', 'audit', 'auditar', 'review',
    'complete', 'completo', 'full', 'entire', 'todo el proyecto',
    'overview', 'estado actual', 'current state', 'health check',
    'codebase', 'cobertura', 'coverage', 'assessment', 'evaluacion',
    'evaluación', 'status', 'calidad', 'quality', 'inspect',
  ];
  const lower = request.toLowerCase();
  return analysisKeywords.some((kw) => lower.includes(kw));
}

/** Main partition function */
export async function partitionTask(
  request: PartitionRequest,
  config: EngineConfig = DEFAULT_CONFIG
): Promise<PartitionResult> {
  const map = await loadProjectMap();
  let relevant = identifyRelevantServices(map, request);

  // If no specific services found but task looks like broad analysis,
  // include all services for a full project scan
  if (relevant.length === 0 && isBroadAnalysisTask(request.userRequest)) {
    relevant = [...map.services];
  }

  if (relevant.length === 0) {
    return {
      needsPartitioning: false,
      reason: 'No specific services identified. Task may be too vague or requires manual scoping.',
      estimatedTokens: 0,
      chunks: [],
      workerRecommendations: [],
    };
  }

  const chunks = createChunks(map, relevant, config);
  const totalTokens = chunks.reduce((sum, c) => sum + c.estimatedTokens, 0);
  const needsPartitioning = chunks.length > 1 || totalTokens > config.partitionThreshold;

  return {
    needsPartitioning,
    reason: needsPartitioning
      ? `Task spans ${relevant.length} services (${formatTokens(totalTokens)} tokens) — exceeds single-worker limit of ${formatTokens(config.partitionThreshold)}`
      : `Task fits in a single worker (${formatTokens(totalTokens)} tokens)`,
    estimatedTokens: totalTokens,
    chunks,
    workerRecommendations: chunks.map(() => 'coder'),
  };
}

/** Build a TaskBrief from partition result */
export function buildTaskBrief(
  request: PartitionRequest,
  partition: PartitionResult,
  config: EngineConfig = DEFAULT_CONFIG
): TaskBrief {
  const taskId = `task-${Date.now()}`;

  const subtasks: Subtask[] | undefined = partition.needsPartitioning
    ? partition.chunks.map((chunk, idx) => ({
        subtaskId: `${taskId}-sub-${idx + 1}`,
        workerType: 'coder',
        objective: `${request.userRequest} [Part ${idx + 1}/${partition.chunks.length}: ${chunk.description}]`,
        contextChunk: chunk,
        dependencies: idx > 0 ? [`${taskId}-sub-${idx}`] : [],
        inputArtifacts: chunk.files,
        expectedOutput: 'Code changes or analysis report for the assigned service(s)',
        successCriteria: [
          'Files compile without errors',
          'Relevant tests pass',
          'Changes documented in technical notes',
        ],
      }))
    : undefined;

  return {
    taskId,
    project: 'polybot',
    taskType: guessTaskType(request.userRequest),
    objective: request.userRequest,
    userRequest: request.userRequest,
    contextChunks: partition.chunks,
    directFiles: !partition.needsPartitioning ? partition.chunks[0]?.files : undefined,
    constraints: ['Never modify files outside assigned scope without approval'],
    successCriteria: [
      'Code compiles (npm run build)',
      'Relevant tests pass (npm test -- <pattern>)',
      'No secrets in code',
    ],
    estimatedTotalTokens: partition.estimatedTokens,
    requiresPartitioning: partition.needsPartitioning,
    subtasks,
  };
}

function guessTaskType(request: string): TaskType {
  const lower = request.toLowerCase();
  if (lower.includes('bug') || lower.includes('fix') || lower.includes('error') || lower.includes('crash'))
    return 'bug-fix';
  if (lower.includes('test') || lower.includes('spec')) return 'testing';
  if (lower.includes('refactor') || lower.includes('clean') || lower.includes('restructure'))
    return 'refactor';
  if (lower.includes('explore') || lower.includes('understand') || lower.includes('how does'))
    return 'exploration';
  if (lower.includes('doc') || lower.includes('readme') || lower.includes('comment'))
    return 'documentation';
  if (lower.includes('implement') || lower.includes('add') || lower.includes('feature') || lower.includes('create'))
    return 'feature-implementation';
  return 'cross-cutting';
}

/** Print a human-readable summary of a partition result */
export function printPartition(partition: PartitionResult): string {
  const lines: string[] = [];
  lines.push(`Partition Result:`);
  lines.push(`  Needs partitioning: ${partition.needsPartitioning ? 'YES' : 'NO'}`);
  lines.push(`  Reason: ${partition.reason}`);
  lines.push(`  Estimated tokens: ${partition.estimatedTokens.toLocaleString()}`);
  lines.push(`  Chunks: ${partition.chunks.length}`);
  for (const chunk of partition.chunks) {
    lines.push(`\n  ${chunk.chunkId} (~${chunk.estimatedTokens.toLocaleString()} tokens)`);
    lines.push(`    Services: ${chunk.services.join(', ') || 'none'}`);
    lines.push(`    Files: ${chunk.files.length}`);
    lines.push(`    Shared: ${chunk.sharedFiles.length}`);
  }
  return lines.join('\n');
}
