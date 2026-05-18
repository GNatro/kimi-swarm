/**
 * Anti-Drift v2.0 — Re-Reader
 * Intelligent context re-reading with budget management
 */

import type { CausalRecord, PlanNode } from './types.js';
import { BUDGET_TOKENS, TOKEN_ESTIMATE_RATIO } from './types.js';
import {
  getLastNRecords,
  getRecordsForPlan,
  searchRecordsByTag,
} from './causal-registry.js';
import { loadPlanGraph, getPlanChain } from './plan-graph.js';
import { loadChecklist } from './checklist-manager.js';
import { getLatestRollup } from './rollup-generator.js';

/**
 * Re-read context for the current turn.
 * Algorithm (§5.3):
 * 1. Active plan (always, full or truncated)
 * 2. Last 5 records for active plan (brief)
 * 3. Parent plan if in side plan (summary only)
 * 4. Last 3 global records excluding active plan (ultra-brief)
 * 5. Historical rollup if budget remains
 */
export function reReadContext(
  _currentTurn: number,
  activePlanId: string | null,
  opts?: { budget?: number }
): string {
  const budget = opts?.budget ?? BUDGET_TOKENS;
  let consumed = 0;
  const segments: string[] = [];

  // ── PHASE 1: Active plan (always, full or truncated) ──
  if (activePlanId) {
    const graph = loadPlanGraph();
    const activePlan = graph.nodes[activePlanId];
    if (activePlan) {
      const planText = serializePlan(activePlan, {
        includeChecklist: true,
      });
      const planTokens = estimateTokens(planText);

      if (planTokens <= budget * 0.3) {
        consumed += planTokens;
        segments.push(`=== ACTIVE PLAN ===\n${planText}`);
      } else {
        // Truncate: only pending + in-progress items
        const summaryText = serializePlan(activePlan, {
          includeChecklist: false,
          summaryOnly: true,
        });
        consumed += estimateTokens(summaryText);
        segments.push(`=== ACTIVE PLAN (summary) ===\n${summaryText}`);
      }
    }
  }

  // ── PHASE 2: Last 5 records for active plan (brief) ──
  if (activePlanId) {
    const activeRecords = getRecordsForPlan(activePlanId, { limit: 5 });
    for (const rec of activeRecords) {
      const text = serializeRecordBrief(rec);
      const tokens = estimateTokens(text);
      if (consumed + tokens > budget * 0.6) break;
      consumed += tokens;
      segments.push(text);
    }
  }

  // ── PHASE 3: Parent plan if in side plan (summary only) ──
  if (activePlanId) {
    const graph = loadPlanGraph();
    const activePlan = graph.nodes[activePlanId];
    if (activePlan?.parentPlanId) {
      const parentPlan = graph.nodes[activePlan.parentPlanId];
      if (parentPlan) {
        const parentText = serializePlan(parentPlan, {
          includeChecklist: false,
          summaryOnly: true,
        });
        const tokens = estimateTokens(parentText);
        if (consumed + tokens < budget * 0.8) {
          consumed += tokens;
          segments.push(`=== PARENT PLAN ===\n${parentText}`);
        }
      }
    }
  }

  // ── PHASE 4: Last 3 global records excluding active plan (ultra-brief) ──
  const recentGlobal = getLastNRecords(10)
    .filter((r) => activePlanId === null || r.planContext.planId !== activePlanId)
    .slice(-3);

  for (const rec of recentGlobal) {
    const text = serializeRecordUltraBrief(rec);
    const tokens = estimateTokens(text);
    if (consumed + tokens > budget * 0.9) break;
    consumed += tokens;
    segments.push(text);
  }

  // ── PHASE 5: Historical rollup if budget remains ──
  const remainingBudget = budget - consumed;
  if (remainingBudget > 2000) {
    const rollup = getLatestRollup();
    if (rollup) {
      const rollupText = `Rollup (${rollup.coversTurns[0]}-${rollup.coversTurns[1]}): ${rollup.summary}`;
      const tokens = estimateTokens(rollupText);
      if (tokens < remainingBudget) {
        segments.push(`=== HISTORICAL SUMMARY ===\n${rollupText}`);
      }
    }
  }

  if (segments.length === 0) {
    return 'No historical context available.';
  }

  return segments.join('\n\n---\n\n');
}

/**
 * Serialize a record with all fields.
 */
export function serializeRecordFull(record: CausalRecord): string {
  return JSON.stringify(record, null, 2);
}

/**
 * Serialize a record briefly (prompt + decision + reasoning summary).
 */
export function serializeRecordBrief(record: CausalRecord): string {
  const prompt = record.userPrompt.slice(0, 100);
  return `Turn ${record.turnNumber} | ${record.planContext.planType ?? 'none'} plan | ${record.decision.type}
Prompt: "${prompt}${record.userPrompt.length > 100 ? '…' : ''}"
Decision: ${record.decision.description}
Reasoning: ${record.reasoning.summary}`;
}

/**
 * Serialize a record ultra-briefly (prompt snippet + decision type).
 */
export function serializeRecordUltraBrief(record: CausalRecord): string {
  const prompt = record.userPrompt.slice(0, 50);
  return `T${record.turnNumber}: "${prompt}${record.userPrompt.length > 50 ? '…' : ''}" → ${record.decision.type}`;
}

/**
 * Serialize a plan node.
 */
export function serializePlan(
  plan: PlanNode,
  opts?: { includeChecklist?: boolean; summaryOnly?: boolean }
): string {
  const includeChecklist = opts?.includeChecklist ?? false;
  const summaryOnly = opts?.summaryOnly ?? false;

  if (summaryOnly) {
    const phases = plan.phases
      .map((p) => `[${p.status}] ${p.title}`)
      .join('\n  ');
    return `Plan: ${plan.title} (${plan.planType}, ${plan.status})
Depth: ${plan.depth}
Phases:\n  ${phases}`;
  }

  let result = `Plan: ${plan.title} (${plan.planType}, ${plan.status})
Description: ${plan.description}
Depth: ${plan.depth}
Phases:\n`;

  for (const phase of plan.phases) {
    result += `  [${phase.status}] ${phase.title}\n`;
  }

  if (includeChecklist) {
    try {
      const checklist = loadChecklist(plan.checklistId);
      const pendingItems = checklist.items.filter(
        (i) => i.status === 'pending' || i.status === 'in-progress'
      );
      if (pendingItems.length > 0) {
        result += `Checklist (pending):\n`;
        for (const item of pendingItems) {
          result += `  [${item.status}] ${item.text}\n`;
        }
      }
    } catch {
      // Checklist not found, skip
    }
  }

  return result;
}

/**
 * Estimate token count from text.
 * Simple heuristic: ~4 characters per token.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / TOKEN_ESTIMATE_RATIO);
}

/**
 * Generate rollup summary for turns before a given point.
 */
export function generateRollup(beforeTurn: number): string {
  const rollup = getLatestRollup();
  if (rollup && rollup.coversTurns[1] < beforeTurn) {
    return `Rollup (${rollup.coversTurns[0]}-${rollup.coversTurns[1]}): ${rollup.summary}`;
  }

  // Fallback: summarize recent records
  const records = getLastNRecords(10).filter((r) => r.turnNumber < beforeTurn);
  if (records.length === 0) return 'No historical summary available.';

  const decisions = records.map((r) => r.decision.description).join('; ');
  return `Recent history (turns ${records[0].turnNumber}-${records[records.length - 1].turnNumber}): ${decisions}`;
}
