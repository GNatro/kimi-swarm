/**
 * Telemetry Collector — Record metrics and events
 */

import { appendFileSync, mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import os from 'os';
import type { TelemetryEvent, TelemetryMetric } from './types.js';

const TELEMETRY_DIR = join(process.env.HOME || os.homedir() || '/tmp', '.kimi/state/telemetry');
const EVENTS_FILE = join(TELEMETRY_DIR, 'events.jsonl');

function ensureDir() {
  mkdirSync(TELEMETRY_DIR, { recursive: true });
}

function nowIso(): string {
  return new Date().toISOString();
}

export function recordEvent(type: string, data: Omit<TelemetryEvent, 'ts' | 'type'>): void {
  ensureDir();
  const event: TelemetryEvent = { ts: nowIso(), type, ...data };
  const line = JSON.stringify(event) + '\n';
  appendFileSync(EVENTS_FILE, line, 'utf-8');
}

export function recordMetric(name: string, value: number, labels?: Record<string, string>): void {
  ensureDir();
  const metric: TelemetryMetric = { ts: nowIso(), name, value, labels };
  const line = JSON.stringify(metric) + '\n';
  appendFileSync(EVENTS_FILE, line, 'utf-8');
}

export function recordGauge(name: string, value: number, project?: string): void {
  recordMetric(name, value, project ? { project } : undefined);
}

export function recordCounter(name: string, increment: number = 1, project?: string): void {
  recordMetric(name, increment, project ? { project } : undefined);
}

export function recordHistogram(name: string, value: number, project?: string): void {
  recordMetric(name, value, project ? { project } : undefined);
}

export function getDailySnapshotPath(date = new Date()): string {
  const ds = date.toISOString().split('T')[0];
  return join(TELEMETRY_DIR, 'daily', `${ds}.json`);
}

export function collectDailySnapshot(): Record<string, unknown> {
  ensureDir();
  const dailyDir = join(TELEMETRY_DIR, 'daily');
  mkdirSync(dailyDir, { recursive: true });

  const snapshot = {
    date: new Date().toISOString().split('T')[0],
    ts: nowIso(),
    souls: { exported: 0, imported: 0, pending: 0, active: 0, consumed: 0 },
    locks: { acquired: 0, released: 0, expired: 0, active: 0 },
    sessions: { started: 0, ended: 0, compacts: 0 },
    health: { checks: 0, failures: 0, last_score: 'unknown' },
    projects: { total: 0, active: 0 },
  };

  const path = getDailySnapshotPath();
  writeFileSync(path, JSON.stringify(snapshot, null, 2), 'utf-8');
  return snapshot;
}

export function readEvents(since?: Date, until?: Date): TelemetryEvent[] {
  if (!existsSync(EVENTS_FILE)) return [];
  const lines = readFileSync(EVENTS_FILE, 'utf-8').split('\n').filter(l => l.trim());
  const events = lines.map(l => JSON.parse(l) as TelemetryEvent);
  if (!since && !until) return events;
  return events.filter(e => {
    const ts = new Date(e.ts).getTime();
    if (since && ts < since.getTime()) return false;
    if (until && ts > until.getTime()) return false;
    return true;
  });
}
