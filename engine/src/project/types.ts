/**
 * Project Types — Agnostic project configuration
 */

export interface ProjectConfig {
  name: string;
  root: string;
  busRoot: string;
  language: string;
  framework?: string;
  servicePatterns?: string[];
  testCommand?: string;
  buildCommand?: string;
  elitesConstitution?: boolean;
  mapIndexedAt?: string | null;
  status?: 'active' | 'inactive';
  registeredAt?: string;
}

export interface ProjectRegistry {
  version: string;
  lastUpdated?: string;
  projects: Record<string, ProjectConfig>;
}

import type { ProjectMap } from '../types/index.js';

export interface LanguageIndexer {
  name: string;
  extensions: string[];
  servicePatterns: string[];
  detectFramework(root: string): Promise<string | null>;
  extractImports(content: string): string[];
  buildMap(root: string, config: ProjectConfig): Promise<ProjectMap>;
}
