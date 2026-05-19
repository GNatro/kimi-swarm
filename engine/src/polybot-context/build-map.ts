#!/usr/bin/env tsx
// DEPRECATED: Use `src/indexer/plugins/typescript.ts` instead.
// This file is kept for backwards compatibility during migration.

/**
 * Polybot Context Map Builder
 * Scans the polybot project and generates a static map for partitioning decisions.
 *
 * Usage: npm run index-polybot
 * Output: src/polybot-context/map.json
 */

import { readdir, readFile, stat, writeFile } from 'fs/promises';
import { join, relative } from 'path';
import type { ProjectMap, ServiceDomain, ProjectFile } from '../types/index.js';
import {
  estimateTokensFromChars,
  buildProjectFile,
  sumTokens,
} from '../utils/token-estimator.js';
import { resolveProjectConfig } from '../project/resolver.js';

const config = resolveProjectConfig();
const POLYBOT_ROOT = config.root || process.cwd();
const SRC_ROOT = join(POLYBOT_ROOT, 'src');
const OUTPUT_PATH = new URL('./map.json', import.meta.url).pathname;

/** List directory entries, filtering out non-directories */
async function listDirs(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

/** Recursively find all .ts and .tsx files under a path */
async function findTsFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findTsFiles(full)));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(full);
    }
  }
  return files;
}

/** Extract import paths from a TypeScript file */
function extractImports(content: string): string[] {
  const imports: string[] = [];
  // Match: import ... from '...' or import ... from "..."
  const regex = /from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

/** Build a pseudo-service for non-service directories (tui, dashboard, etc.) */
async function buildPseudoService(
  name: string,
  dirPath: string,
  projectRoot: string
): Promise<ServiceDomain> {
  const tsFiles = await findTsFiles(dirPath);
  const files: ProjectFile[] = [];
  for (const absPath of tsFiles) {
    files.push(await buildProjectFile(absPath, projectRoot));
  }
  return {
    name,
    path: relative(projectRoot, dirPath),
    files,
    totalTokens: sumTokens(files),
    importsFrom: [],
    importedBy: [],
    sharedDependencies: [],
  };
}

/** Build a service domain from its directory */
async function buildServiceDomain(
  serviceName: string,
  servicePath: string,
  projectRoot: string
): Promise<ServiceDomain> {
  const tsFiles = await findTsFiles(servicePath);
  const files: ProjectFile[] = [];
  const allImports: string[] = [];

  for (const absPath of tsFiles) {
    const pf = await buildProjectFile(absPath, projectRoot);
    files.push(pf);
    try {
      const content = await readFile(absPath, 'utf-8');
      allImports.push(...extractImports(content));
    } catch {
      // ignore unreadable
    }
  }

  // Determine cross-service imports
  const importsFrom = new Set<string>();
  const sharedDeps = new Set<string>();

  for (const imp of allImports) {
    if (imp.startsWith('../')) {
      // Could be another service or core/types
      const parts = imp.split('/');
      if (parts.length >= 2) {
        // e.g., '../market-cache/index.js' -> 'market-cache'
        // or '../../core/logger.js' -> 'core'
        const target = parts[parts.length - 2]; // directory before file
        if (target === 'core' || target === 'types' || target === 'scripts') {
          sharedDeps.add(target);
        } else if (target !== serviceName) {
          importsFrom.add(target);
        }
      }
    } else if (imp.startsWith('./')) {
      // Internal import, ignore
    } else {
      // External dependency (npm package)
      // Not tracked for context partitioning
    }
  }

  return {
    name: serviceName,
    path: relative(projectRoot, servicePath),
    files,
    totalTokens: sumTokens(files),
    importsFrom: Array.from(importsFrom),
    importedBy: [], // populated later
    sharedDependencies: Array.from(sharedDeps),
  };
}

/** Build the shared (cross-cutting) section */
async function buildShared(projectRoot: string): Promise<ProjectMap['shared']> {
  const dirs = ['core', 'types', 'scripts'];
  const allFiles: ProjectFile[] = [];

  for (const dir of dirs) {
    const dirPath = join(projectRoot, dir);
    const tsFiles = await findTsFiles(dirPath).catch(() => []);
    for (const f of tsFiles) {
      allFiles.push(await buildProjectFile(f, projectRoot));
    }
  }

  // Tests are under src/__tests__ and scattered */__tests__/
  const testFiles: ProjectFile[] = [];
  const allTs = await findTsFiles(projectRoot);
  for (const f of allTs) {
    if (f.includes('/__tests__/') || f.endsWith('.test.ts') || f.endsWith('.spec.ts')) {
      testFiles.push(await buildProjectFile(f, projectRoot));
    }
  }

  return {
    core: allFiles.filter((f) => f.relativePath.startsWith('core/')),
    types: allFiles.filter((f) => f.relativePath.startsWith('types/')),
    tests: testFiles,
    scripts: allFiles.filter((f) => f.relativePath.startsWith('scripts/')),
    totalTokens: sumTokens(allFiles) + sumTokens(testFiles),
  };
}

/** Main builder */
async function buildMap(): Promise<ProjectMap> {
  console.log(`[build-map] Scanning ${SRC_ROOT}...`);

  const servicesDir = join(SRC_ROOT, 'services');
  const serviceNames = await listDirs(servicesDir);
  console.log(`[build-map] Found ${serviceNames.length} services`);

  const services: ServiceDomain[] = [];
  for (const name of serviceNames.sort()) {
    const domain = await buildServiceDomain(name, join(servicesDir, name), POLYBOT_ROOT);
    services.push(domain);
    console.log(
      `  ${name}: ${domain.files.length} files, ${domain.totalTokens} tokens, imports: [${domain.importsFrom.join(', ')}]`
    );
  }

  // Populate importedBy reverse mapping
  const importMap = new Map<string, Set<string>>();
  for (const svc of services) {
    for (const target of svc.importsFrom) {
      if (!importMap.has(target)) importMap.set(target, new Set());
      importMap.get(target)!.add(svc.name);
    }
  }
  for (const svc of services) {
    svc.importedBy = Array.from(importMap.get(svc.name) || []);
  }

  // Build pseudo-services for non-service directories (tui, dashboard, etc.)
  const tuiDomain = await buildPseudoService('tui', join(SRC_ROOT, 'tui'), POLYBOT_ROOT);
  if (tuiDomain.files.length > 0) services.push(tuiDomain);

  const shared = await buildShared(SRC_ROOT);

  const allServiceFiles = services.reduce((sum, s) => sum + s.files.length, 0);
  const allServiceTokens = services.reduce((sum, s) => sum + s.totalTokens, 0);

  const map: ProjectMap = {
    projectName: 'polybot',
    projectRoot: POLYBOT_ROOT,
    totalFiles: allServiceFiles + shared.core.length + shared.types.length + shared.tests.length + shared.scripts.length,
    totalTokens: allServiceTokens + shared.totalTokens,
    services,
    shared,
    generatedAt: new Date().toISOString(),
  };

  return map;
}

// Run
buildMap()
  .then(async (map) => {
    await writeFile(OUTPUT_PATH, JSON.stringify(map, null, 2));
    console.log(`\n[build-map] Done!`);
    console.log(`  Total files: ${map.totalFiles}`);
    console.log(`  Total tokens: ${map.totalTokens.toLocaleString()}`);
    console.log(`  Services: ${map.services.length}`);
    console.log(`  Shared tokens: ${map.shared.totalTokens.toLocaleString()}`);
    console.log(`  Output: ${OUTPUT_PATH}`);
  })
  .catch((err) => {
    console.error('[build-map] Failed:', err);
    process.exit(1);
  });
