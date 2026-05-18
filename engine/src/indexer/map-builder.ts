/**
 * Map Builder Utilities
 * Common logic used by all language indexer plugins.
 */

import { readFileSync, statSync, readdirSync } from 'fs';
import { join, relative, extname } from 'path';
import type { ProjectFile } from '../types/index.js';

export function estimateTokensFromChars(content: string): number {
  return Math.ceil(content.length / 4);
}

export function buildProjectFile(absPath: string, projectRoot: string): ProjectFile {
  const content = readFileSafe(absPath);
  return {
    relativePath: relative(projectRoot, absPath),
    absolutePath: absPath,
    sizeBytes: statSync(absPath).size,
    estimatedTokens: estimateTokensFromChars(content),
  };
}

export function sumTokens(files: ProjectFile[]): number {
  return files.reduce((sum, f) => sum + f.estimatedTokens, 0);
}

export async function findFiles(dir: string, extensions: string[]): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        results.push(...(await findFiles(path, extensions)));
      } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
        results.push(path);
      }
    }
  } catch {
    // Directory may not exist
  }
  return results;
}

export function buildImportGraph(files: ProjectFile[]): Record<string, string[]> {
  const graph: Record<string, string[]> = {};
  for (const file of files) {
    const content = readFileSafe(file.absolutePath);
    const imports: string[] = [];
    const regex = /from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      imports.push(match[1] || match[2]);
    }
    graph[file.relativePath] = imports;
  }
  return graph;
}

function readFileSafe(path: string): string {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return '';
  }
}
