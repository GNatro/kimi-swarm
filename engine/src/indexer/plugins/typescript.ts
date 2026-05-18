/**
 * TypeScript Indexer Plugin
 * Scans TypeScript/JavaScript projects and builds a project map.
 */

import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import type { LanguageIndexer, ProjectConfig } from '../../project/types.js';
import type { ProjectMap, ProjectFile, ServiceDomain } from '../../types/index.js';
import { findFiles, buildProjectFile, sumTokens } from '../map-builder.js';

export const typescriptPlugin: LanguageIndexer = {
  name: 'typescript',
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
  servicePatterns: ['src/services/*', 'src/modules/*', 'src/core', 'src/tui', 'src/dashboard', 'src/apps/*'],

  async detectFramework(root: string): Promise<string | null> {
    const pkgPath = join(root, 'package.json');
    if (!existsSync(pkgPath)) return null;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
      const deps = {
        ...(pkg.dependencies as Record<string, string> || {}),
        ...(pkg.devDependencies as Record<string, string> || {}),
      };
      if (deps.fastify) return 'fastify';
      if (deps.express) return 'express';
      if (deps.next) return 'next';
      if (deps.react) return 'react';
      if (deps.vue) return 'vue';
      return 'node';
    } catch {
      return null;
    }
  },

  extractImports(content: string): string[] {
    const imports: string[] = [];
    const regex = /from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      imports.push(match[1] || match[2]);
    }
    return imports;
  },

  async buildMap(root: string, config: ProjectConfig): Promise<ProjectMap> {
    const patterns = config.servicePatterns || this.servicePatterns;
    const allFiles = await findFiles(root, this.extensions);
    const projectFiles = allFiles.map(f => buildProjectFile(f, root));

    // Group files by service pattern
    const services: ServiceDomain[] = [];
    const matchedFiles = new Set<string>();

    for (const pattern of patterns) {
      const serviceName = pattern.replace(/\*/g, '').replace(/\/$/, '').replace(/\//g, '-');
      const serviceFiles = projectFiles.filter(f => {
        const rel = f.relativePath;
        const match = pattern.includes('*')
          ? rel.startsWith(pattern.replace('/*', '/'))
          : rel.startsWith(pattern + '/');
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

    // Shared files = unmatched
    const sharedFiles = projectFiles.filter(f => !matchedFiles.has(f.relativePath));
    const coreFiles = sharedFiles.filter(f => f.relativePath.startsWith('src/core/') || f.relativePath.startsWith('src/utils/'));
    const typeFiles = sharedFiles.filter(f => f.relativePath.includes('.type') || f.relativePath.includes('/types/'));
    const testFiles = sharedFiles.filter(f => f.relativePath.includes('.test.') || f.relativePath.includes('.spec.') || f.relativePath.includes('/__tests__/'));
    const scriptFiles = sharedFiles.filter(f => f.relativePath.startsWith('scripts/'));
    const otherShared = sharedFiles.filter(f =>
      !coreFiles.includes(f) && !typeFiles.includes(f) && !testFiles.includes(f) && !scriptFiles.includes(f)
    );

    return {
      projectName: config.name,
      projectRoot: root,
      totalFiles: projectFiles.length,
      totalTokens: sumTokens(projectFiles),
      services,
      shared: {
        core: coreFiles,
        types: typeFiles,
        tests: testFiles,
        scripts: scriptFiles,
        totalTokens: sumTokens(otherShared),
      },
      generatedAt: new Date().toISOString(),
    };
  }
};
