/**
 * Auto-Test Script
 * Detects which services were modified and runs the appropriate test filters.
 */

import { readFile, readdir } from 'fs/promises';
import { join, relative } from 'path';
import { execSync } from 'child_process';
import { DEFAULT_CONFIG } from '../types/index.js';
import { getProject } from '../project/registry.js';
import { resolveProjectId } from '../project/resolver.js';

function resolveProjectPaths(projectId: string) {
  const config = getProject(projectId);
  const projectRoot = config?.root ?? DEFAULT_CONFIG.projectRoot;
  const busRoot = config?.busRoot ?? DEFAULT_CONFIG.busRoot;
  const busDir = join(busRoot, 'bus');
  const responsesDir = join(busDir, 'responses');
  return { projectRoot, busDir, responsesDir };
}

interface AffectedService {
  name: string;
  files: string[];
  testPattern: string;
}

/** Detect changed files from git status */
export function getChangedFiles(projectId: string): string[] {
  const { projectRoot } = resolveProjectPaths(projectId);
  try {
    const output = execSync('git diff --name-only HEAD', { cwd: projectRoot, encoding: 'utf-8' });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/** Map files to services using project config */
export function mapFilesToServices(files: string[], projectId: string): AffectedService[] {
  const services = new Map<string, string[]>();
  const config = projectId ? getProject(projectId) : null;
  const patterns = config?.servicePatterns || ['src/services/*', 'src/core', 'src/tui', 'src/types'];

  for (const file of files) {
    let matched = false;
    for (const pattern of patterns) {
      if (pattern.includes('*')) {
        const prefix = pattern.replace('/*', '/');
        if (file.startsWith(prefix)) {
          const svc = file.substring(prefix.length).split('/')[0];
          if (svc) {
            if (!services.has(svc)) services.set(svc, []);
            services.get(svc)!.push(file);
            matched = true;
            break;
          }
        }
      } else {
        const prefix = pattern + '/';
        if (file.startsWith(prefix)) {
          const svc = pattern.split('/').pop() || pattern;
          if (!services.has(svc)) services.set(svc, []);
          services.get(svc)!.push(file);
          matched = true;
          break;
        }
      }
    }
    if (!matched) {
      // Fallback: group unmatched under 'other'
      if (!services.has('other')) services.set('other', []);
      services.get('other')!.push(file);
    }
  }

  return Array.from(services.entries()).map(([name, files]) => ({
    name,
    files,
    testPattern: name === 'core' || name === 'types' || name === 'other' ? '' : name,
  }));
}

/** Generate test command for affected services */
export function generateTestCommand(services: AffectedService[]): string {
  const patterns = services
    .filter((s) => s.testPattern)
    .map((s) => s.testPattern);

  if (patterns.length === 0) {
    // Core/types changed — run full test suite (but not all at once)
    return 'npm test -- --run'; // vitest --run for CI-like execution
  }

  // Run tests matching service names
  const filter = patterns.join('|');
  return `npm test -- --run -t "${filter}"`;
}

/** Read worker results to detect what files they touched */
export async function detectAffectedFromWorkers(taskId: string, projectId: string): Promise<AffectedService[]> {
  const changed = new Set<string>();
  const { responsesDir } = resolveProjectPaths(projectId);

  try {
    const files = await readdir(responsesDir);
    for (const file of files) {
      if (!file.endsWith('-result.md')) continue;
      if (taskId && !file.includes(taskId)) continue;

      const content = await readFile(join(responsesDir, file), 'utf-8');

      // Extract file modifications from markdown
      const fileMatches = Array.from(content.matchAll(/[`\*]?([\w/.-]+\.(?:ts|tsx|js|json))[`\*]?\s*[:-]\s*(?:modified|created|deleted|changed)/gi));
      for (const match of fileMatches) {
        changed.add(match[1]);
      }

      // Also look for "Files Modified" sections
      const sectionMatch = content.match(/##\s*Files\s*(?:Modified|Changed).*?\n([\s\S]*?)(?=\n##|$)/i);
      if (sectionMatch) {
        const lines = sectionMatch[1].split('\n');
        for (const line of lines) {
          const m = line.match(/[`\*]?([\w/.-]+\.(?:ts|tsx|js|json))[`\*]?/);
          if (m) changed.add(m[1]);
        }
      }
    }
  } catch {
    // No responses
  }

  return mapFilesToServices(Array.from(changed), projectId);
}

/** Run tests and return results */
export function runTests(command: string, projectId: string): { success: boolean; output: string; duration: number } {
  const { projectRoot } = resolveProjectPaths(projectId);
  const start = Date.now();
  try {
    const output = execSync(command, {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 120_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true, output, duration: Date.now() - start };
  } catch (error: any) {
    return {
      success: false,
      output: error.stdout || '' + error.stderr || '',
      duration: Date.now() - start,
    };
  }
}

/** CLI entry point */
async function main() {
  const args = process.argv.slice(2);
  const taskId = args.find((a) => !a.startsWith('--')) || 'default';
  const fromGit = args.includes('--git');
  const dryRun = args.includes('--dry-run');
  const projectFlag = args.find((a) => a.startsWith('--project='));
  const projectId = projectFlag ? projectFlag.split('=')[1] : resolveProjectId();

  let services: AffectedService[];

  if (fromGit) {
    console.log('Detecting affected services from git diff...');
    services = mapFilesToServices(getChangedFiles(projectId), projectId);
  } else {
    console.log('Detecting affected services from worker results...');
    services = await detectAffectedFromWorkers(taskId, projectId);
  }

  if (services.length === 0) {
    console.log('No affected services detected.');
    return;
  }

  console.log('\nAffected services:');
  for (const svc of services) {
    console.log(`  ${svc.name}: ${svc.files.length} file(s)`);
  }

  const command = generateTestCommand(services);
  console.log(`\nTest command: ${command}`);

  if (dryRun) {
    console.log('(dry-run, not executing)');
    return;
  }

  console.log('\nRunning tests...');
  const result = runTests(command, projectId);

  console.log(`\n${result.success ? '✅' : '❌'} Tests ${result.success ? 'passed' : 'failed'} in ${(result.duration / 1000).toFixed(1)}s`);

  if (!result.success) {
    console.log('\nOutput:');
    console.log(result.output.slice(-2000)); // Last 2000 chars
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
