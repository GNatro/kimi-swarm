/**
 * Token Estimation Utilities
 * Uses chars/4 heuristic (conservative for code)
 */

import { readFile } from 'fs/promises';
import { stat } from 'fs/promises';
import type { ProjectFile } from '../types/index.js';

/** Estimate tokens from character count */
export function estimateTokensFromChars(charCount: number): number {
  // Conservative: 1 token ≈ 4 chars for English/code
  // For TypeScript with symbols/punctuation, sometimes 1 token ≈ 3.5 chars
  // We use 4 to stay safely under limits
  return Math.ceil(charCount / 4);
}

/** Estimate tokens for a file without reading it fully */
export async function estimateFileTokens(absolutePath: string): Promise<number> {
  try {
    const stats = await stat(absolutePath);
    return estimateTokensFromChars(stats.size);
  } catch {
    return 0;
  }
}

/** Create a ProjectFile from path */
export async function buildProjectFile(
  absolutePath: string,
  projectRoot: string
): Promise<ProjectFile> {
  const stats = await stat(absolutePath);
  const relativePath = absolutePath.replace(projectRoot + '/', '');
  return {
    relativePath,
    absolutePath,
    sizeBytes: stats.size,
    estimatedTokens: estimateTokensFromChars(stats.size),
  };
}

/** Sum tokens for a list of files */
export function sumTokens(files: ProjectFile[]): number {
  return files.reduce((sum, f) => sum + f.estimatedTokens, 0);
}

/** Format token count for display */
export function formatTokens(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return `${tokens}`;
}

/** Check if adding a file would exceed the chunk limit */
export function wouldExceedLimit(
  currentTokens: number,
  fileTokens: number,
  limit: number
): boolean {
  return currentTokens + fileTokens > limit;
}
