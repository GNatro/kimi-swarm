/**
 * Scope Estimator — Estimate task scope from intent + project map
 */

import type { ProjectMap } from '../types/index.js';

export interface ScopeResult {
  estimatedFiles: { min: number; max: number; avg: number };
  estimatedServices: number;
  estimatedTokens: number;
  requiresPartitioning: boolean;
  relevantServices: string[];
  confidence: number;
}

interface ScopeInput {
  taskType: string;
  keywords: string[];
  projectMap?: ProjectMap | null;
  partitionThreshold?: number;
}

/**
 * Estimate scope based on task type and optional project map
 */
export function estimateScope(input: ScopeInput): ScopeResult {
  const { taskType, keywords, projectMap, partitionThreshold = 120_000 } = input;

  // 1. Find relevant services from project map (if available)
  const relevantServices = findRelevantServices(keywords, projectMap);

  // 2. Base file estimates by task type
  const baseEstimate = getBaseFileEstimate(taskType);

  // 3. Adjust based on relevant services found
  let estimatedFiles = { ...baseEstimate };
  if (projectMap && relevantServices.length > 0) {
    const serviceCount = relevantServices.length;
    const avgFilesPerService = Math.ceil(
      projectMap.services.reduce((sum, s) => sum + s.files.length, 0) /
        Math.max(1, projectMap.services.length)
    );
    estimatedFiles.avg = Math.max(estimatedFiles.avg, serviceCount * avgFilesPerService);
    estimatedFiles.min = Math.max(estimatedFiles.min, serviceCount);
    estimatedFiles.max = Math.max(estimatedFiles.max, serviceCount * avgFilesPerService * 2);
  }

  // 4. Cross-service impact adjustments
  if (taskType === 'feature' && keywords.some(k => ['auth', 'login', 'security'].includes(k))) {
    estimatedFiles.avg += 2;
    estimatedFiles.max += 4;
  }
  if (taskType === 'refactor') {
    estimatedFiles.avg = Math.max(estimatedFiles.avg, 5);
    estimatedFiles.max = Math.max(estimatedFiles.max, 15);
  }

  // 5. Estimate tokens (rough heuristic: ~400 tokens per file)
  const estimatedTokens = estimatedFiles.avg * 400;

  // 6. Determine if partitioning is needed
  const requiresPartitioning = estimatedTokens > partitionThreshold;

  // 7. Confidence
  const confidence = projectMap ? 0.7 : 0.4;

  return {
    estimatedFiles,
    estimatedServices: relevantServices.length || (taskType === 'refactor' ? 2 : 1),
    estimatedTokens,
    requiresPartitioning,
    relevantServices,
    confidence,
  };
}

function getBaseFileEstimate(taskType: string): { min: number; max: number; avg: number } {
  switch (taskType) {
    case 'typo':
      return { min: 1, max: 1, avg: 1 };
    case 'bug-fix':
      return { min: 1, max: 3, avg: 2 };
    case 'test':
      return { min: 1, max: 4, avg: 2 };
    case 'security':
      return { min: 2, max: 8, avg: 4 };
    case 'feature':
      return { min: 3, max: 10, avg: 5 };
    case 'refactor':
      return { min: 5, max: 20, avg: 8 };
    case 'docs':
      return { min: 1, max: 3, avg: 1 };
    case 'exploration':
      return { min: 0, max: 0, avg: 0 };
    default:
      return { min: 1, max: 5, avg: 2 };
  }
}

function findRelevantServices(keywords: string[], projectMap?: ProjectMap | null): string[] {
  if (!projectMap || !projectMap.services) return [];

  const relevant = new Set<string>();
  for (const keyword of keywords) {
    const kw = keyword.toLowerCase();
    for (const service of projectMap.services) {
      const svcName = service.name.toLowerCase();
      if (svcName.includes(kw) || kw.includes(svcName)) {
        relevant.add(service.name);
      }
      for (const file of service.files) {
        const fileName = file.relativePath.toLowerCase();
        if (fileName.includes(kw)) {
          relevant.add(service.name);
          break;
        }
      }
    }
  }
  return [...relevant];
}
