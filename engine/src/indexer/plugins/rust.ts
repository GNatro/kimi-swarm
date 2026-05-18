/**
 * Rust Indexer Plugin (Stub)
 * Minimal implementation — full buildMap not yet supported.
 */

import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import type { LanguageIndexer, ProjectConfig } from '../../project/types.js';
import type { ProjectMap } from '../../types/index.js';

export const rustPlugin: LanguageIndexer = {
  name: 'rust',
  extensions: ['.rs'],
  servicePatterns: ['src/bin/', 'crates/', 'src/', 'lib/', 'apps/'],

  async detectFramework(root: string): Promise<string | null> {
    const cargoPath = join(root, 'Cargo.toml');
    if (!existsSync(cargoPath)) return null;
    try {
      const content = readFileSync(cargoPath, 'utf-8');
      if (content.includes('actix')) return 'actix';
      if (content.includes('axum')) return 'axum';
      if (content.includes('rocket')) return 'rocket';
      return 'rust';
    } catch {
      return null;
    }
  },

  extractImports(content: string): string[] {
    const imports: string[] = [];
    const regex = /use\s+([\w:]+)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    return imports;
  },

  async buildMap(root: string, config: ProjectConfig): Promise<ProjectMap> {
    throw new Error('Not yet fully implemented for rust. Use genericPlugin fallback or implement.');
  }
};
