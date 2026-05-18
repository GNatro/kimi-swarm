/**
 * Python Indexer Plugin (Stub)
 * Minimal implementation — full buildMap not yet supported.
 */

import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import type { LanguageIndexer, ProjectConfig } from '../../project/types.js';
import type { ProjectMap } from '../../types/index.js';

export const pythonPlugin: LanguageIndexer = {
  name: 'python',
  extensions: ['.py'],
  servicePatterns: ['src/', 'lib/', 'apps/', 'modules/', '*/'],

  async detectFramework(root: string): Promise<string | null> {
    const pyprojectPath = join(root, 'pyproject.toml');
    if (existsSync(pyprojectPath)) {
      try {
        const content = readFileSync(pyprojectPath, 'utf-8');
        if (content.includes('fastapi')) return 'fastapi';
        if (content.includes('django')) return 'django';
        if (content.includes('flask')) return 'flask';
      } catch {
        // ignore
      }
    }
    const reqPath = join(root, 'requirements.txt');
    if (existsSync(reqPath)) {
      try {
        const content = readFileSync(reqPath, 'utf-8');
        if (content.includes('fastapi')) return 'fastapi';
        if (content.includes('django')) return 'django';
        if (content.includes('flask')) return 'flask';
      } catch {
        // ignore
      }
    }
    return 'python';
  },

  extractImports(content: string): string[] {
    const imports: string[] = [];
    const regex = /^(?:from|import)\s+([\w.]+)/gm;
    let match;
    while ((match = regex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    return imports;
  },

  async buildMap(root: string, config: ProjectConfig): Promise<ProjectMap> {
    throw new Error('Not yet fully implemented for python. Use genericPlugin fallback or implement.');
  }
};
