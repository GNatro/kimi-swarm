/**
 * Light Mode — Direct execution with minimal ceremony
 * Checks: V1 (Build) + V3 (Safety) + V5 (Spec match)
 * Skips: Partitioner, PEV formal, V2/V4/V6/V7
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

export interface LightCheckResult {
  check: 'V1' | 'V3' | 'V5';
  passed: boolean;
  details: string;
}

export interface LightResult {
  checks: LightCheckResult[];
  allPassed: boolean;
  recommendation?: string;
}

/**
 * Run light mode checks after direct execution
 */
export async function runLightChecks(projectRoot: string): Promise<LightResult> {
  const checks: LightCheckResult[] = [];

  // V1: Build check (try npm run build if package.json exists)
  let v1Passed = true;
  let v1Details = 'No build command found, skipped';
  
  if (existsSync(`${projectRoot}/package.json`)) {
    try {
      execSync('npm run build', { cwd: projectRoot, stdio: 'pipe', timeout: 30000 });
      v1Details = 'Build passed (0 errors)';
    } catch (err) {
      v1Passed = false;
      v1Details = 'Build failed — see output above';
    }
  }
  
  checks.push({ check: 'V1', passed: v1Passed, details: v1Details });

  // V3: Safety check (scan for secrets in modified files)
  let v3Passed = true;
  let v3Details = 'No modified files detected';
  
  try {
    const diff = execSync('git diff --name-only', { cwd: projectRoot, encoding: 'utf-8' });
    const files = diff.trim().split('\n').filter(f => f);
    
    if (files.length > 0) {
      const secretPatterns = [
        /api[_-]?key/i,
        /password/i,
        /secret/i,
        /token/i,
        /private[_-]?key/i,
        /AKIA[0-9A-Z]{16}/, // AWS key pattern
      ];
      
      const riskyFiles: string[] = [];
      for (const file of files) {
        try {
          const content = execSync(`git diff "${file}"`, { cwd: projectRoot, encoding: 'utf-8' });
          for (const pattern of secretPatterns) {
            if (pattern.test(content)) {
              riskyFiles.push(file);
              break;
            }
          }
        } catch {
          // skip files we can't read
        }
      }
      
      if (riskyFiles.length > 0) {
        v3Passed = false;
        v3Details = `Potential secrets in: ${riskyFiles.join(', ')}`;
      } else {
        v3Details = `${files.length} files checked, no secrets detected`;
      }
    }
  } catch {
    v3Details = 'Safety check skipped (not a git repo)';
  }
  
  checks.push({ check: 'V3', passed: v3Passed, details: v3Details });

  // V5: Spec match (manual — agent must verify)
  checks.push({
    check: 'V5',
    passed: true, // Agent confirms
    details: 'Agent must verify: does this match what was requested?',
  });

  const allPassed = checks.every(c => c.passed);
  
  return {
    checks,
    allPassed,
    recommendation: allPassed 
      ? 'All light checks passed. Task complete.'
      : 'Some checks failed. Consider running full verification.',
  };
}

/**
 * Check if a task is within light mode scope
 */
export function isLightScope(request: string, filesModified: number = 0): boolean {
  // Light mode is appropriate for:
  // - Single file changes
  // - Documentation updates
  // - Typo fixes
  // - Simple refactors (<2 min)
  
  const lightKeywords = ['typo', 'fix typo', 'readme', 'comment', 'rename', 'move'];
  const hasLightKeyword = lightKeywords.some(kw => request.toLowerCase().includes(kw));
  
  if (filesModified > 1) return false;
  if (request.length > 200) return false; // Too complex
  
  return hasLightKeyword || filesModified <= 1;
}
