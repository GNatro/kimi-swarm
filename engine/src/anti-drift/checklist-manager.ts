/**
 * Anti-Drift v2.0 — Checklist Manager
 * Living checklists that evolve, inherit, and sync
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { LiveChecklist, ChecklistItem, ChecklistItemStatus } from './types.js';
import {
  CHECKLISTS_DIR,
  MAX_CHECKLIST_ITEMS,
  generateId,
  nowIso,
} from './types.js';

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function getChecklistsDir(): string {
  return CHECKLISTS_DIR();
}

function checklistPath(checklistId: string): string {
  return `${getChecklistsDir()}/${checklistId}.json`;
}

/**
 * Create a new checklist for a plan.
 */
export function createChecklist(planId: string, title: string): LiveChecklist {
  const checklist: LiveChecklist = {
    checklistId: `chk-${generateId()}`,
    planId,
    title,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    version: 1,
    items: [],
    inheritedItemsFrozen: false,
  };

  saveChecklist(checklist);
  return checklist;
}

/**
 * Load a checklist from disk.
 */
export function loadChecklist(checklistId: string): LiveChecklist {
  const path = checklistPath(checklistId);
  if (!existsSync(path)) {
    throw new Error(`Checklist ${checklistId} not found at ${path}`);
  }
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content) as LiveChecklist;
}

/**
 * Save a checklist to disk.
 */
export function saveChecklist(checklist: LiveChecklist): void {
  ensureDir(checklistPath(checklist.checklistId));
  checklist.updatedAt = nowIso();
  writeFileSync(checklistPath(checklist.checklistId), JSON.stringify(checklist, null, 2));
}

/**
 * Add an item to a checklist.
 */
export function addItem(
  checklist: LiveChecklist,
  text: string,
  addedBy: ChecklistItem['addedBy']
): ChecklistItem {
  if (checklist.items.length >= MAX_CHECKLIST_ITEMS) {
    throw new Error(
      `Cannot add item: checklist has reached maximum of ${MAX_CHECKLIST_ITEMS} items`
    );
  }

  const item: ChecklistItem = {
    itemId: `item-${generateId()}`,
    text,
    status: 'pending',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    addedBy,
    relatedRecordIds: [],
    relatedPlanIds: [checklist.planId],
  };

  checklist.items.push(item);
  checklist.version++;
  saveChecklist(checklist);
  return item;
}

/**
 * Mark an item as done.
 */
export function markDone(checklist: LiveChecklist, itemId: string): void {
  const item = checklist.items.find((i) => i.itemId === itemId);
  if (!item) return;

  item.status = 'done';
  item.doneAt = nowIso();
  item.updatedAt = nowIso();
  checklist.version++;
  saveChecklist(checklist);
}

/**
 * Mark an item as skipped with a reason.
 */
export function markSkipped(
  checklist: LiveChecklist,
  itemId: string,
  reason: string
): void {
  const item = checklist.items.find((i) => i.itemId === itemId);
  if (!item) return;

  item.status = 'skipped';
  item.blockedReason = reason;
  item.updatedAt = nowIso();
  checklist.version++;
  saveChecklist(checklist);
}

/**
 * Create a checklist for a side plan that inherits from the parent.
 */
export function inheritChecklist(
  parentChecklist: LiveChecklist,
  sidePlanId: string
): LiveChecklist {
  const inheritedItems: ChecklistItem[] = parentChecklist.items.map((item) => ({
    ...item,
    itemId: `item-${generateId()}`, // New IDs for inherited items
    relatedPlanIds: [...item.relatedPlanIds, sidePlanId],
  }));

  const sideChecklist: LiveChecklist = {
    checklistId: `chk-${generateId()}`,
    planId: sidePlanId,
    title: `${parentChecklist.title} (inherited)`,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    version: 1,
    items: inheritedItems,
    inheritedFromChecklistId: parentChecklist.checklistId,
    inheritedItemsFrozen: true,
  };

  saveChecklist(sideChecklist);
  return sideChecklist;
}

/**
 * Sync a parent checklist when a side plan returns.
 * - Done items from side → parent
 * - New items from side → parent (marked as addedBy: 'side-plan')
 */
export function syncChecklistOnReturn(
  parentChecklist: LiveChecklist,
  sideChecklist: LiveChecklist
): void {
  // Sync done items
  for (const sideItem of sideChecklist.items) {
    if (sideItem.status === 'done') {
      // Try to find corresponding parent item by text similarity
      const parentItem = parentChecklist.items.find(
        (p) => p.text === sideItem.text || p.text.startsWith(sideItem.text)
      );
      if (parentItem && parentItem.status !== 'done') {
        parentItem.status = 'done';
        parentItem.doneAt = sideItem.doneAt;
        parentItem.updatedAt = nowIso();
      }
    }
  }

  // Add new side items to parent (items not inherited)
  const inheritedIds = new Set(
    parentChecklist.items.map((i) => i.text)
  );

  for (const sideItem of sideChecklist.items) {
    if (!inheritedIds.has(sideItem.text)) {
      // This is a new item from the side plan
      if (parentChecklist.items.length >= MAX_CHECKLIST_ITEMS) {
        break; // Don't exceed limit
      }
      parentChecklist.items.push({
        ...sideItem,
        itemId: `item-${generateId()}`,
        addedBy: 'side-plan',
        relatedPlanIds: [...sideItem.relatedPlanIds, parentChecklist.planId],
        updatedAt: nowIso(),
      });
    }
  }

  parentChecklist.version++;
  saveChecklist(parentChecklist);
}

/**
 * Archive old done items to prevent unbounded growth.
 * Moves items done more than `turnsThreshold` turns ago to a "historical" state.
 * For simplicity, we just remove very old done items and track them separately.
 */
export function archiveOldItems(
  checklist: LiveChecklist,
  _turnsThreshold: number
): void {
  // In a real implementation, we'd track turn numbers per item.
  // For now, we keep all items but enforce the max limit at add time.
  // This function serves as a hook for future archiving logic.
}

/**
 * Suggest checklist items to mark as done based on modified files.
 */
export function suggestMarkDone(
  checklist: LiveChecklist,
  modifiedFiles: string[]
): string[] {
  const suggestions = new Set<string>();

  for (const item of checklist.items) {
    if (item.status !== 'pending' && item.status !== 'in-progress') continue;

    const itemLower = item.text.toLowerCase();
    const itemWords = itemLower.split(/\s+/).filter((w) => w.length > 3);

    for (const file of modifiedFiles) {
      const fileLower = file.toLowerCase();
      const fileName = file.split('/').pop()?.toLowerCase() ?? '';

      // Direct inclusion checks
      if (
        itemLower.includes(fileName) ||
        itemLower.includes(fileLower) ||
        fileName.includes(itemLower.replace(/\s+/g, '-')) ||
        fileName.includes(itemLower.replace(/\s+/g, '_'))
      ) {
        suggestions.add(item.itemId);
        break;
      }

      // Word overlap check
      for (const word of itemWords) {
        if (fileLower.includes(word)) {
          suggestions.add(item.itemId);
          break;
        }
      }

      if (suggestions.has(item.itemId)) break;
    }
  }

  return [...suggestions];
}
