/**
 * Elite Constitution Bridge
 * Integrates L1-L7 laws, V1-V8 gates, Bounded Memory v2.0, and Response Contract.
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import type { EliteConstitution, V1V8Result } from './types.js';

const L1_L7 = `## Constitutional Laws (Always Binding)
L1. UNKNOWN = STOP. Declare it. Do not proceed on uncertainty.
L2. EVIDENCE-FIRST. Every claim requires citation, source, or verification path.
L3. 6-LENS REVIEW. Architect, Implementer, Risk, QA, Arbiter, Red Team.
L4. PEV LOOP. Plan → Execute → Verify. Max 3 iterations.
L5. QUANTIFIED RISK. Risk = P(1-5) × I(1-5). Score ≥ 13 → escalate.
L6. ANTI-SELF-DECEPTION. List 3 ways output could be wrong. Verify each.
L7. ABSOLUTE CONTRACT. NEVER fabricate, skip plan, auto-approve, batch unrelated.`;

const RESPONSE_CONTRACT = `## Response Contract
Every response MUST follow:
[CONTEXT] 1-2 sentences
[PHASE] PLAN / EXECUTE / VERIFY / DELIVER / ESCALATE
[EVIDENCE] Key citations, sources, verification results
[OUTPUT] The actual deliverable
[CHANGE LOG] [NEW] / [MODIFIED] / [DELETED]: paths
[NEXT STEP] Explicit request or completion declaration`;

const CHALLENGE_GRADE_ADDON = `
## Full Doctrine Reference
- Architect Lens: Structural integrity, scalability, dependency direction.
- Implementer Lens: Correctness, idioms, error handling.
- Risk Lens: Attack surface, failure modes, blast radius.
- QA Lens: Test coverage, edge cases, regression risk.
- Arbiter Lens: Standards compliance, consistency, naming.
- Red Team Lens: Adversarial exploitation, misuse paths.
`;

export async function loadConstitution(projectRoot: string): Promise<EliteConstitution | null> {
  const dir = join(projectRoot, '.elite-constitution');
  if (!existsSync(dir)) return null;

  const read = (name: string): string => {
    try {
      return readFileSync(join(dir, name), 'utf-8');
    } catch {
      return '';
    }
  };

  return {
    laws: { L1_L7 },
    v1v8: {
      V1: 'Structural: Code compiles, builds pass, no syntax errors.',
      V2: 'Semantic: Logic matches intent, no behavioral regressions.',
      V3: 'Safety: No secrets, no injection vectors, safe defaults.',
      V4: 'Quality: Cohesion, naming, test coverage, docs.',
      V5: 'Spec: Requirements fully implemented, no scope creep.',
      V6: 'Regression: Existing tests pass, no broken contracts.',
      V7: 'Edge Cases: Nulls, empty, concurrency, errors handled.',
      V8: 'Evidence: Claims verified with traces, tests, citations.',
    },
    responseContract: RESPONSE_CONTRACT,
    rituals: {
      ritual5: 'End-Session Save: Export soul before session ends.',
      ritual6: 'Resume: Import soul and hydrate context on start.',
      ritual9: 'Verification: Run V1-V8 gates before delivering.',
    },
  };
}

export function injectConstitutionIntoWorkerPrompt(
  basePrompt: string,
  constitution: EliteConstitution | null,
  mode: 'standard' | 'challenge-grade' | 'light' = 'standard'
): string {
  if (!constitution) return basePrompt;

  const parts: string[] = [];

  if (mode === 'light' || mode === 'standard' || mode === 'challenge-grade') {
    parts.push(L1_L7);
  }

  if (mode === 'challenge-grade') {
    parts.push(CHALLENGE_GRADE_ADDON);
  }

  parts.push(basePrompt);

  if (mode === 'standard' || mode === 'challenge-grade') {
    parts.push(RESPONSE_CONTRACT);
  }

  return parts.join('\n\n---\n\n');
}

export interface V1V8Options {
  filesModified: string[];
  buildStatus: string;
  hasSecrets: boolean;
  scopeMatchesPlan: boolean;
  testsRun: string;
  hasEvidence: boolean;
}

export async function runV1V8Gates(options: V1V8Options): Promise<V1V8Result> {
  const gates: V1V8Result['gates'] = [
    {
      gate: 'V1 STRUCTURAL',
      passed: options.buildStatus === 'pass',
      evidence: options.buildStatus === 'pass' ? 'Build passed' : `Build status: ${options.buildStatus}`,
    },
    {
      gate: 'V2 SEMANTIC',
      passed: false,
      evidence: 'Semantic verification requires manual review or AI-assisted analysis',
    },
    {
      gate: 'V3 SAFETY',
      passed: !options.hasSecrets,
      evidence: options.hasSecrets ? 'Secrets detected in diff' : 'No secrets detected',
    },
    {
      gate: 'V4 QUALITY',
      passed: options.filesModified.length < 20,
      evidence: `${options.filesModified.length} files modified`,
    },
    {
      gate: 'V5 SPEC',
      passed: options.scopeMatchesPlan,
      evidence: options.scopeMatchesPlan ? 'Scope matches plan' : 'Scope mismatch detected',
    },
    {
      gate: 'V6 REGRESSION',
      passed: options.testsRun.includes('pass'),
      evidence: `Tests: ${options.testsRun}`,
    },
    {
      gate: 'V7 EDGE CASES',
      passed: false,
      evidence: 'Edge case review requires manual verification',
    },
    {
      gate: 'V8 EVIDENCE',
      passed: options.hasEvidence,
      evidence: options.hasEvidence ? 'Evidence present' : 'Missing evidence',
    },
  ];

  const failCount = gates.filter(g => !g.passed && g.gate !== 'V2 SEMANTIC' && g.gate !== 'V7 EDGE CASES').length;
  const overall: V1V8Result['overall'] = failCount > 0 ? 'fail' : gates.some(g => !g.passed) ? 'warn' : 'pass';

  return { overall, gates };
}

export function formatResponseContract(
  output: string,
  meta: {
    context?: string;
    phase?: string;
    evidence?: string;
    changeLog?: string;
    nextStep?: string;
  }
): string {
  return `[CONTEXT] ${meta.context || 'Continuing task execution'}
[PHASE] ${meta.phase || 'EXECUTE'}
[EVIDENCE] ${meta.evidence || 'See output below'}
[OUTPUT]
${output}
[CHANGE LOG] ${meta.changeLog || '[NONE]'}
[NEXT STEP] ${meta.nextStep || 'Continue execution'}`;
}

export function checkBoundedMemoryThreshold(
  filePath: string,
  maxLines: number
): { exceeded: boolean; currentLines: number; maxLines: number } {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const currentLines = content.split('\n').length;
    return { exceeded: currentLines > maxLines, currentLines, maxLines };
  } catch {
    return { exceeded: false, currentLines: 0, maxLines };
  }
}
