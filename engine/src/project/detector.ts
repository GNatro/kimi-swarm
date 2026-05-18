/**
 * Project Detector — Auto-detect language, framework, service patterns
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export function detectLanguage(projectRoot: string): string {
  if (existsSync(join(projectRoot, 'package.json'))) return 'typescript';
  if (existsSync(join(projectRoot, 'pyproject.toml')) || existsSync(join(projectRoot, 'requirements.txt'))) return 'python';
  if (existsSync(join(projectRoot, 'go.mod'))) return 'go';
  if (existsSync(join(projectRoot, 'Cargo.toml'))) return 'rust';
  if (existsSync(join(projectRoot, 'Gemfile'))) return 'ruby';
  if (existsSync(join(projectRoot, 'pom.xml')) || existsSync(join(projectRoot, 'build.gradle'))) return 'java';
  return 'generic';
}

export function detectFramework(projectRoot: string): string | null {
  const pkgPath = join(projectRoot, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
      const deps: Record<string, string> = {
        ...(pkg.dependencies as Record<string, string> || {}),
        ...(pkg.devDependencies as Record<string, string> || {}),
      };
      if (deps.fastify) return 'fastify';
      if (deps.express) return 'express';
      if (deps.next) return 'next';
      if (deps.react) return 'react';
      if (deps.vue) return 'vue';
      if (deps.nuxt) return 'nuxt';
      if (deps.svelte) return 'svelte';
      if (deps.nestjs || '@nestjs/core' in deps) return 'nestjs';
      return 'node';
    } catch {
      return null;
    }
  }

  if (existsSync(join(projectRoot, 'go.mod'))) {
    try {
      const mod = readFileSync(join(projectRoot, 'go.mod'), 'utf-8');
      if (mod.includes('gin')) return 'gin';
      if (mod.includes('echo')) return 'echo';
      if (mod.includes('fiber')) return 'fiber';
      return 'go-std';
    } catch {
      return null;
    }
  }

  if (existsSync(join(projectRoot, 'pyproject.toml'))) {
    try {
      const pyproject = readFileSync(join(projectRoot, 'pyproject.toml'), 'utf-8');
      if (pyproject.includes('fastapi')) return 'fastapi';
      if (pyproject.includes('flask')) return 'flask';
      if (pyproject.includes('django')) return 'django';
      return 'python-std';
    } catch {
      return null;
    }
  }

  return null;
}

export function detectServicePatterns(projectRoot: string): string[] {
  const lang = detectLanguage(projectRoot);
  switch (lang) {
    case 'typescript':
    case 'javascript':
      return ['src/services/*', 'src/modules/*', 'src/core', 'src/tui', 'src/dashboard', 'src/pages'];
    case 'python':
      return ['*/', 'src/', 'lib/', 'app/', 'services/'];
    case 'go':
      return ['cmd/', 'pkg/', 'internal/', 'api/'];
    case 'rust':
      return ['src/bin/', 'crates/', 'src/'];
    case 'java':
      return ['src/main/java/', 'src/test/java/'];
    default:
      return ['src/', 'lib/', 'app/'];
  }
}
