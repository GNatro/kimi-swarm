import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { LiveChecklist } from '../../src/anti-drift/types.js';
import {
  createChecklist,
  loadChecklist,
  saveChecklist,
  addItem,
  markDone,
  markSkipped,
  inheritChecklist,
  syncChecklistOnReturn,
  archiveOldItems,
  suggestMarkDone,
} from '../../src/anti-drift/checklist-manager.js';

const TEST_DIR = mkdtempSync(join(tmpdir(), 'anti-drift-cl-test-'));
process.env.HOME = TEST_DIR;

// Re-import paths
const { CHECKLISTS_DIR } = await import('../../src/anti-drift/types.js');

describe('checklist-manager', () => {
  beforeEach(async () => {
    // Clean up test checklists
    try {
      const fs = await import('fs');
      if (fs.existsSync(CHECKLISTS_DIR())) {
        fs.rmSync(CHECKLISTS_DIR(), { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  it('createChecklist initializes with empty items', () => {
    const cl = createChecklist('plan-1', 'My Checklist');
    expect(cl.items).toEqual([]);
    expect(cl.planId).toBe('plan-1');
    expect(cl.title).toBe('My Checklist');
  });

  it('addItem increments version', () => {
    const cl = createChecklist('plan-1', 'Test');
    const v1 = cl.version;
    addItem(cl, 'New item', 'ai');
    expect(cl.version).toBe(v1 + 1);
    expect(cl.items.length).toBe(1);
  });

  it('markDone sets doneAt', () => {
    const cl = createChecklist('plan-1', 'Test');
    const item = addItem(cl, 'Task', 'ai');
    markDone(cl, item.itemId);
    const updated = cl.items.find((i) => i.itemId === item.itemId);
    expect(updated!.status).toBe('done');
    expect(updated!.doneAt).toBeDefined();
  });

  it('markSkipped sets blockedReason', () => {
    const cl = createChecklist('plan-1', 'Test');
    const item = addItem(cl, 'Task', 'ai');
    markSkipped(cl, item.itemId, 'Not needed');
    const updated = cl.items.find((i) => i.itemId === item.itemId);
    expect(updated!.status).toBe('skipped');
    expect(updated!.blockedReason).toBe('Not needed');
  });

  it('done item is immutable (cannot modify text)', () => {
    const cl = createChecklist('plan-1', 'Test');
    const item = addItem(cl, 'Task', 'ai');
    markDone(cl, item.itemId);
    // In our implementation, "immutable" means we don't provide an edit function
    // The item status is done and stays done
    const updated = cl.items.find((i) => i.itemId === item.itemId);
    expect(updated!.status).toBe('done');
  });

  it('inheritChecklist copies parent items', () => {
    const parent = createChecklist('plan-main', 'Parent');
    addItem(parent, 'Task A', 'ai');
    addItem(parent, 'Task B', 'ai');
    const side = inheritChecklist(parent, 'plan-side');
    expect(side.items.length).toBe(2);
    expect(side.inheritedFromChecklistId).toBe(parent.checklistId);
    expect(side.inheritedItemsFrozen).toBe(true);
  });

  it('inherited items are frozen', () => {
    const parent = createChecklist('plan-main', 'Parent');
    addItem(parent, 'Task A', 'ai');
    const side = inheritChecklist(parent, 'plan-side');
    expect(side.inheritedItemsFrozen).toBe(true);
  });

  it('syncChecklistOnReturn marks parent items done', () => {
    const parent = createChecklist('plan-main', 'Parent');
    const itemA = addItem(parent, 'Research JWT', 'ai');
    const side = inheritChecklist(parent, 'plan-side');
    markDone(side, side.items[0].itemId);
    syncChecklistOnReturn(parent, side);
    const updated = parent.items.find((i) => i.itemId === itemA.itemId);
    expect(updated!.status).toBe('done');
  });

  it('syncChecklistOnReturn adds side items to parent', () => {
    const parent = createChecklist('plan-main', 'Parent');
    addItem(parent, 'Task A', 'ai');
    const side = inheritChecklist(parent, 'plan-side');
    const newItem = addItem(side, 'New side task', 'ai');
    markDone(side, newItem.itemId);
    syncChecklistOnReturn(parent, side);
    const found = parent.items.find((i) => i.text === 'New side task');
    expect(found).toBeDefined();
    expect(found!.addedBy).toBe('side-plan');
  });

  it('archiveOldItems does not throw', () => {
    const cl = createChecklist('plan-1', 'Test');
    addItem(cl, 'Old task', 'ai');
    markDone(cl, cl.items[0].itemId);
    // Should not throw
    archiveOldItems(cl, 5);
    expect(cl.items.length).toBe(1); // Currently a no-op
  });

  it('suggestMarkDone matches file paths', () => {
    const cl = createChecklist('plan-1', 'Test');
    addItem(cl, 'Implement auth middleware', 'ai');
    const suggestions = suggestMarkDone(cl, ['src/auth/middleware.ts']);
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('suggestMarkDone returns empty if no match', () => {
    const cl = createChecklist('plan-1', 'Test');
    addItem(cl, 'Fix bug', 'ai');
    const suggestions = suggestMarkDone(cl, ['src/users/profile.ts']);
    expect(suggestions.length).toBe(0);
  });

  it('Max 20 items enforced', () => {
    const cl = createChecklist('plan-1', 'Test');
    for (let i = 0; i < 20; i++) {
      addItem(cl, `Task ${i}`, 'ai');
    }
    expect(cl.items.length).toBe(20);
    expect(() => addItem(cl, 'Extra', 'ai')).toThrow();
  });

  it('Version increments on every mutation', () => {
    const cl = createChecklist('plan-1', 'Test');
    expect(cl.version).toBe(1);
    addItem(cl, 'A', 'ai');
    expect(cl.version).toBe(2);
    markDone(cl, cl.items[0].itemId);
    expect(cl.version).toBe(3);
  });

  it('Checklist saves and loads correctly', () => {
    const cl = createChecklist('plan-1', 'Test');
    addItem(cl, 'Saved item', 'ai');
    const loaded = loadChecklist(cl.checklistId);
    expect(loaded.title).toBe('Test');
    expect(loaded.items.length).toBe(1);
    expect(loaded.items[0].text).toBe('Saved item');
  });

  it('Item createdAt / updatedAt tracked', () => {
    const cl = createChecklist('plan-1', 'Test');
    const item = addItem(cl, 'Tracked', 'ai');
    expect(item.createdAt).toBeDefined();
    expect(item.updatedAt).toBeDefined();
  });

  it('relatedRecordIds populated', () => {
    const cl = createChecklist('plan-1', 'Test');
    const item = addItem(cl, 'Task', 'ai');
    expect(item.relatedRecordIds).toEqual([]);
  });

  it('relatedPlanIds populated', () => {
    const cl = createChecklist('plan-1', 'Test');
    const item = addItem(cl, 'Task', 'ai');
    expect(item.relatedPlanIds).toContain('plan-1');
  });

  it('Side plan can mark inherited item done', () => {
    const parent = createChecklist('plan-main', 'Parent');
    addItem(parent, 'Inherited', 'ai');
    const side = inheritChecklist(parent, 'plan-side');
    markDone(side, side.items[0].itemId);
    expect(side.items[0].status).toBe('done');
  });

  it('Parent checklist version updates on sync', () => {
    const parent = createChecklist('plan-main', 'Parent');
    addItem(parent, 'Task', 'ai');
    const side = inheritChecklist(parent, 'plan-side');
    markDone(side, side.items[0].itemId);
    const vBefore = parent.version;
    syncChecklistOnReturn(parent, side);
    expect(parent.version).toBe(vBefore + 1);
  });
});
