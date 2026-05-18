/**
 * Anti-Drift v2.0 — Rollup Generator
 * Periodic summarization of causal records
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { dirname } from 'path';
import type { RollupRecord, CausalRecord } from './types.js';
import { ROLLUPS_DIR, ROLLUP_INTERVAL, generateId, nowIso } from './types.js';

function getRollupsDir(): string {
  return ROLLUPS_DIR();
}
import { getLastNRecords, getTotalRecordCount } from './causal-registry.js';

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function rollupPath(rollupId: string): string {
  return `${getRollupsDir()}/${rollupId}.json`;
}

/**
 * Generate a rollup record covering turns [startTurn, endTurn].
 */
export function generateRollupRecord(
  startTurn: number,
  endTurn: number
): RollupRecord {
  // Gather records in range
  const allRecords = getLastNRecords(getTotalRecordCount());
  const records = allRecords.filter(
    (r) => r.turnNumber >= startTurn && r.turnNumber <= endTurn
  );

  const plansCreated = new Set<string>();
  const plansCompleted = new Set<string>();
  const filesModified = new Set<string>();
  const keyDecisions: string[] = [];
  const unresolvedQuestions: string[] = [];

  for (const rec of records) {
    // Plans created
    if (rec.decision.type === 'create-plan') {
      rec.decision.affectedPlanIds.forEach((id) => plansCreated.add(id));
    }

    // Plans completed
    if (rec.decision.type === 'return-from-side') {
      rec.decision.affectedPlanIds.forEach((id) => plansCompleted.add(id));
    }

    // Files
    rec.postState.filesModified.forEach((f) => filesModified.add(f));
    rec.decision.affectedFiles.forEach((f) => filesModified.add(f));

    // Key decisions
    if (rec.reasoning.confidence >= 0.7) {
      keyDecisions.push(rec.reasoning.summary);
    }

    // Unresolved questions
    (rec.postState.pendingDecisions ?? []).forEach((d) => unresolvedQuestions.push(d));
  }

  // Build summary narrative
  const summaryParts: string[] = [];
  summaryParts.push(`Turns ${startTurn}-${endTurn}: ${records.length} records.`);

  if (plansCreated.size > 0) {
    summaryParts.push(`Created ${plansCreated.size} plan(s).`);
  }
  if (plansCompleted.size > 0) {
    summaryParts.push(`Completed ${plansCompleted.size} plan(s).`);
  }
  if (filesModified.size > 0) {
    summaryParts.push(`Modified ${filesModified.size} file(s).`);
  }
  if (keyDecisions.length > 0) {
    summaryParts.push(`Key decisions: ${keyDecisions.slice(0, 3).join('; ')}`);
  }

  const rollup: RollupRecord = {
    rollupId: `rollup-${startTurn}-${endTurn}`,
    coversTurns: [startTurn, endTurn],
    summary: summaryParts.join(' '),
    keyDecisions: [...new Set(keyDecisions)].slice(0, 10),
    plansCreated: [...plansCreated],
    plansCompleted: [...plansCompleted],
    filesModified: [...filesModified],
    unresolvedQuestions: [...new Set(unresolvedQuestions)],
  };

  return rollup;
}

/**
 * Save a rollup to disk.
 */
export function saveRollup(rollup: RollupRecord): void {
  ensureDir(rollupPath(rollup.rollupId));
  writeFileSync(rollupPath(rollup.rollupId), JSON.stringify(rollup, null, 2));
}

/**
 * Load a rollup by ID.
 */
export function loadRollup(rollupId: string): RollupRecord | null {
  const path = rollupPath(rollupId);
  if (!existsSync(path)) return null;
  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content) as RollupRecord;
  } catch {
    return null;
  }
}

/**
 * Get the latest rollup.
 */
export function getLatestRollup(): RollupRecord | null {
  const dir = getRollupsDir();
  if (!existsSync(dir)) return null;

  const files = readdirSync(dir)
    .filter((f) => f.startsWith('rollup-') && f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) return null;

  try {
    const content = readFileSync(`${dir}/${files[0]}`, 'utf-8');
    return JSON.parse(content) as RollupRecord;
  } catch {
    return null;
  }
}

/**
 * Check if a rollup should be generated for the current turn.
 */
export function shouldGenerateRollup(currentTurn: number): boolean {
  return currentTurn > 0 && currentTurn % ROLLUP_INTERVAL === 0;
}

/**
 * Auto-generate and save rollup if needed.
 */
export function autoGenerateRollup(currentTurn: number): RollupRecord | null {
  if (!shouldGenerateRollup(currentTurn)) return null;

  const startTurn = Math.max(1, currentTurn - ROLLUP_INTERVAL + 1);
  const rollup = generateRollupRecord(startTurn, currentTurn);
  saveRollup(rollup);
  return rollup;
}
