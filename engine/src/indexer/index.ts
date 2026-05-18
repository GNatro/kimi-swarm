/**
 * Generic Project Indexer
 * Entry point for building project maps across all supported languages.
 */

import { getProject } from '../project/registry.js';
import type { ProjectConfig, LanguageIndexer } from '../project/types.js';
import type { ProjectMap } from '../types/index.js';
import { typescriptPlugin } from './plugins/typescript.js';
import { pythonPlugin } from './plugins/python.js';
import { goPlugin } from './plugins/go.js';
import { rustPlugin } from './plugins/rust.js';
import { genericPlugin } from './plugins/generic.js';

export async function buildProjectMap(projectId: string): Promise<ProjectMap> {
  const config = getProject(projectId);
  if (!config) throw new Error(`Project not found: ${projectId}`);

  const plugin = getIndexerPlugin(config.language);
  return plugin.buildMap(config.root, config);
}

function getIndexerPlugin(language: string): LanguageIndexer {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return typescriptPlugin;
    case 'python':
      return pythonPlugin;
    case 'go':
      return goPlugin;
    case 'rust':
      return rustPlugin;
    default:
      return genericPlugin;
  }
}
