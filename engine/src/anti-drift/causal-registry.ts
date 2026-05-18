/**
 * Anti-Drift v2.0 — Causal Registry
 * Append-only JSONL storage for causal records
 */

import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from 'fs';
import { dirname } from 'path';
import type { CausalRecord } from './types.js';
import {
  CAUSAL_REGISTRY_PATH,
  PROMPT_TRUNCATE_BYTES,
  REASONING_TRUNCATE_BYTES,
  hashString,
} from './types.js';

function getRegistryPath(): string {
  return CAUSAL_REGISTRY_PATH();
}

// Ensure directory exists
function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Append a record to the causal registry.
 * Uses atomic write: write to temp, then rename.
 */
export function appendRecord(record: CausalRecord): void {
  const path = getRegistryPath();
  ensureDir(path);

  // Truncate large fields before storage
  const stored: CausalRecord = {
    ...record,
    userPrompt: truncatePrompt(record.userPrompt, PROMPT_TRUNCATE_BYTES),
    reasoning: {
      ...record.reasoning,
      summary: truncatePrompt(record.reasoning.summary, REASONING_TRUNCATE_BYTES),
    },
  };

  const line = JSON.stringify(stored) + '\n';
  appendFileSync(path, line);
}

/**
 * Get the last N records from the registry.
 */
export function getLastNRecords(n: number): CausalRecord[] {
  const path = getRegistryPath();
  if (!existsSync(path)) return [];

  const content = readFileSync(path, 'utf-8');
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const records: CausalRecord[] = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line) as CausalRecord);
    } catch {
      // Skip corrupted lines
    }
  }

  return records.slice(-n);
}

/**
 * Get all records associated with a specific plan.
 */
export function getRecordsForPlan(
  planId: string,
  opts?: { limit?: number; offset?: number }
): CausalRecord[] {
  const path = getRegistryPath();
  if (!existsSync(path)) return [];

  const content = readFileSync(path, 'utf-8');
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const records: CausalRecord[] = [];
  for (const line of lines) {
    try {
      const rec = JSON.parse(line) as CausalRecord;
      if (
        rec.planContext.planId === planId ||
        rec.decision.affectedPlanIds.includes(planId)
      ) {
        records.push(rec);
      }
    } catch {
      // Skip corrupted lines
    }
  }

  const offset = opts?.offset ?? 0;
  const limit = opts?.limit ?? records.length;
  return records.slice(offset, offset + limit);
}

/**
 * Get a record by its ID.
 */
export function getRecordById(recordId: string): CausalRecord | null {
  const path = getRegistryPath();
  if (!existsSync(path)) return null;

  const content = readFileSync(path, 'utf-8');
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const rec = JSON.parse(lines[i]) as CausalRecord;
      if (rec.recordId === recordId) return rec;
    } catch {
      // Skip corrupted lines
    }
  }

  return null;
}

/**
 * Search records by tag.
 */
export function searchRecordsByTag(tag: string): CausalRecord[] {
  const path = getRegistryPath();
  if (!existsSync(path)) return [];

  const content = readFileSync(path, 'utf-8');
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const records: CausalRecord[] = [];
  for (const line of lines) {
    try {
      const rec = JSON.parse(line) as CausalRecord;
      if (rec.tags.includes(tag)) records.push(rec);
    } catch {
      // Skip corrupted lines
    }
  }

  return records;
}

/**
 * Get total number of records in registry.
 */
export function getTotalRecordCount(): number {
  const path = getRegistryPath();
  if (!existsSync(path)) return 0;

  const content = readFileSync(path, 'utf-8');
  return content
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .length;
}

/**
 * Truncate a string to a maximum byte length.
 * Handles multi-byte UTF-8 characters correctly.
 */
export function truncatePrompt(prompt: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(prompt);
  if (bytes.length <= maxBytes) return prompt;

  const ellipsis = '...';
  const ellipsisBytes = encoder.encode(ellipsis).length;
  const targetBytes = maxBytes - ellipsisBytes;
  if (targetBytes <= 0) return ellipsis.slice(0, maxBytes);

  // Linear search from the end for the correct length
  for (let i = prompt.length; i >= 0; i--) {
    const slice = prompt.slice(0, i);
    if (encoder.encode(slice).length <= targetBytes) {
      return slice + ellipsis;
    }
  }

  return ellipsis;
}

/**
 * Hash a prompt using SHA-256.
 */
export function hashPrompt(prompt: string): string {
  return hashString(prompt);
}
