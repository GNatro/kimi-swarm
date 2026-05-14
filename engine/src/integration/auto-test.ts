/**
 * Auto-Test Script
 * Detects which services were modified and runs the appropriate test filters.
 */

import { readFile, readdir } from 'fs/promises';
import { join, relative } from 'path';
import { execSync } from 'child_process';
import { DEFAULT_CONFIG } from '../types/index.js';

const PROJECT_ROOT = DEFAULT_CONFIG.polybotRoot;
const BUS_DIR = join(DEFAULT_CONFIG.busRoot, 'bus');
const RESPONSES_DIR = join(BUS_DIR, 'responses');

interface AffectedService {
  name: string;
  files: string[];
  testPattern: string;
}

/** Detect changed files from git status */
export function getChangedFiles(): string[] {
  try {
    const output = execSync('git diff --name-only HEAD', { cwd: PROJECT_ROOT, encoding: 'utf-8' });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/** Map files to services */
export function mapFilesToServices(files: string[]): AffectedService[] {
  const services = new Map<string, string[]>();

  for (const file of files) {
    // Match src/services/<name>/...
    const serviceMatch = file.match(/^src\/services\/([^/]+)\//);
    if (serviceMatch) {
      const svc = serviceMatch[1];
      if (!services.has(svc)) services.set(svc, []);
      services.get(svc)!.push(file);
      continue;
    }

    // Match src/tui/...
    if (file.startsWith('src/tui/')) {
      if (!services.has('tui')) services.set('tui', []);
      services.get('tui')!.push(file);
      continue;
    }

    // Match src/core/... (affects everything)
    if (file.startsWith('src/core/')) {
      if (!services.has('core')) services.set('core', []);
      services.get('core')!.push(file);
      continue;
    }

    // Match src/types/... (affects everything)
    if (file.startsWith('src/types/')) {
      if (!services.has('types')) services.set('types', []);
      services.get('types')!.push(file);
      continue;
    }
  }

  return Array.from(services.entries()).map(([name, files]) => ({
    name,
    files,
    testPattern: name === 'core' || name === 'types' ? '' : name,
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
export async function detectAffectedFromWorkers(taskId?: string): Promise<AffectedService[]> {
  const changed = new Set<string>();

  try {
    const files = await readdir(RESPONSES_DIR);
    for (const file of files) {
      if (!file.endsWith('-result.md')) continue;
      if (taskId && !file.includes(taskId)) continue;

      const content = await readFile(join(RESPONSES_DIR, file), 'utf-8');

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

  return mapFilesToServices(Array.from(changed));
}

/** Run tests and return results */
export function runTests(command: string): { success: boolean; output: string; duration: number } {
  const start = Date.now();
  try {
    const output = execSync(command, {
      cwd: PROJECT_ROOT,
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
  const taskId = args.find((a) => !a.startsWith('--'));
  const fromGit = args.includes('--git');
  const dryRun = args.includes('--dry-run');

  let services: AffectedService[];

  if (fromGit) {
    console.log('Detecting affected services from git diff...');
    services = mapFilesToServices(getChangedFiles());
  } else {
    console.log('Detecting affected services from worker results...');
    services = await detectAffectedFromWorkers(taskId);
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
  const result = runTests(command);

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
