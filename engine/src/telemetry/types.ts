/**
 * Telemetry Types — Metrics and Events
 */

export interface TelemetryEvent {
  ts: string;           // ISO timestamp
  type: string;         // event type
  project?: string;     // project ID
  agent?: string;       // agent ID
  [key: string]: unknown;
}

export interface TelemetryMetric {
  ts: string;
  name: string;
  value: number;
  project?: string;
  labels?: Record<string, string>;
}

export type MetricType = 'counter' | 'gauge' | 'histogram';

export interface MetricDefinition {
  name: string;
  type: MetricType;
  description: string;
  unit?: string;
}

export const DEFAULT_METRICS: MetricDefinition[] = [
  { name: 'souls_exported', type: 'counter', description: 'Total souls exported' },
  { name: 'souls_imported', type: 'counter', description: 'Total souls imported' },
  { name: 'souls_pending', type: 'gauge', description: 'Souls currently pending' },
  { name: 'locks_acquired', type: 'counter', description: 'Total locks acquired' },
  { name: 'locks_released', type: 'counter', description: 'Total locks released' },
  { name: 'locks_expired', type: 'counter', description: 'Total locks expired' },
  { name: 'locks_active', type: 'gauge', description: 'Locks currently active' },
  { name: 'sessions_started', type: 'counter', description: 'Sessions started' },
  { name: 'sessions_ended', type: 'counter', description: 'Sessions ended' },
  { name: 'compacts_triggered', type: 'counter', description: 'Context compacts triggered' },
  { name: 'health_checks_run', type: 'counter', description: 'Health checks executed' },
  { name: 'health_check_failures', type: 'counter', description: 'Health checks failed' },
  { name: 'build_duration_ms', type: 'histogram', description: 'Build duration in milliseconds' },
  { name: 'indexer_duration_ms', type: 'histogram', description: 'Indexer buildProjectMap duration' },
];
