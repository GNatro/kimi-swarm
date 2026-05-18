/**
 * Generic Indexer Plugin (Fallback)
 * Minimal implementation for unsupported languages.
 */

import type { LanguageIndexer, ProjectConfig } from '../../project/types.js';
import type { ProjectMap, ProjectFile, ServiceDomain } from '../../types/index.js';
import { findFiles, buildProjectFile, sumTokens } from '../map-builder.js';

export const genericPlugin: LanguageIndexer = {
  name: 'generic',
  extensions: [''],
  servicePatterns: ['src/', 'lib/', 'app/', 'code/'],

  async detectFramework(root: string): Promise<string | null> {
    return 'generic';
  },

  extractImports(content: string): string[] {
    return [];
  },

  async buildMap(root: string, config: ProjectConfig): Promise<ProjectMap> {
    const patterns = config.servicePatterns || this.servicePatterns;
    const allFiles = await findFiles(root, ['']);
    const projectFiles = allFiles.map(f => buildProjectFile(f, root));

    const services: ServiceDomain[] = [];
    const matchedFiles = new Set<string>();

    for (const pattern of patterns) {
      const serviceName = pattern.replace(/\*/g, '').replace(/\/$/, '').replace(/\//g, '-') || 'root';
      const serviceFiles = projectFiles.filter(f => {
        const rel = f.relativePath;
        const match = pattern.includes('*')
          ? rel.startsWith(pattern.replace('/*', '/'))
          : rel.startsWith(pattern + '/') || rel === pattern;
        if (match) matchedFiles.add(rel);
        return match;
      });
      if (serviceFiles.length > 0) {
        services.push({
          name: serviceName,
          path: pattern,
          files: serviceFiles,
          totalTokens: sumTokens(serviceFiles),
          importsFrom: [],
          importedBy: [],
          sharedDependencies: [],
        });
      }
    }

    const sharedFiles = projectFiles.filter(f => !matchedFiles.has(f.relativePath));

    return {
      projectName: config.name,
      projectRoot: root,
      totalFiles: projectFiles.length,
      totalTokens: sumTokens(projectFiles),
      services,
      shared: {
        core: sharedFiles,
        types: [],
        tests: [],
        scripts: [],
        totalTokens: sumTokens(sharedFiles),
      },
      generatedAt: new Date().toISOString(),
    };
  }
};
