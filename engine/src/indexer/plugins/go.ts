/**
 * Go Indexer Plugin (Stub)
 * Minimal implementation — full buildMap not yet supported.
 */

import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import type { LanguageIndexer, ProjectConfig } from '../../project/types.js';
import type { ProjectMap } from '../../types/index.js';

export const goPlugin: LanguageIndexer = {
  name: 'go',
  extensions: ['.go'],
  servicePatterns: ['cmd/', 'pkg/', 'internal/', 'api/', 'services/'],

  async detectFramework(root: string): Promise<string | null> {
    const modPath = join(root, 'go.mod');
    if (!existsSync(modPath)) return null;
    try {
      const content = readFileSync(modPath, 'utf-8');
      if (content.includes('gin')) return 'gin';
      if (content.includes('echo')) return 'echo';
      if (content.includes('fiber')) return 'fiber';
      return 'go';
    } catch {
      return null;
    }
  },

  extractImports(content: string): string[] {
    const imports: string[] = [];
    const regex = /import\s+\(?\s*"([^"]+)"/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    return imports;
  },

  async buildMap(root: string, config: ProjectConfig): Promise<ProjectMap> {
    throw new Error('Not yet fully implemented for go. Use genericPlugin fallback or implement.');
  }
};
