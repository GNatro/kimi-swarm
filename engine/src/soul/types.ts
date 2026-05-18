/**
 * Soul & Swarm Core Types
 * Swarm & Soul Merge — Polybot
 */

export interface SoulManifest {
  soul_id: string;
  agent_id: string;
  agent_role: string;
  session_id: string;
  project: string;
  project_root: string;
  git_branch: string;
  git_commit: string;
  git_commit_message: string;
  parent_soul_id: string | null;
  child_soul_ids: string[];
  created_at: string;
  exported_by: string;
  export_reason: string;
  status: 'active' | 'consumed' | 'archived';
  files_touched: SoulFileTouch[];
  services_affected: string[];
  tests_run: string;
  build_status: string;
  next_steps: string[];
  blockers: string[];
  risk_score: number;
  elite_constitution_version: string;
  memory_files_included: string[];
  estimated_tokens: number;
}

export interface SoulFileTouch {
  path: string;
  action: 'modified' | 'created' | 'deleted';
  lines_changed: number;
}

export interface SoulExportOptions {
  agentId: string;
  agentRole: string;
  exportReason: string;
  includeDiff?: boolean;
  includeVerification?: boolean;
  projectId: string;
}

export interface SoulExportResult {
  soulId: string;
  soulPath: string;
  filesWritten: string[];
  estimatedTokens: number;
}

export interface SoulImportOptions {
  agentId: string;
  agentRole: string;
  autoApplyDiff?: boolean;
  skipVerification?: boolean;
  projectId: string;
}

export interface SoulImportResult {
  soulId: string;
  status: 'hydrated' | 'partial' | 'conflict' | 'failed';
  hydratedPath: string;
  diffReviewPath?: string;
  filesToReview: string[];
  nextSteps: string[];
  warnings: string[];
  estimatedContextTokens: number;
}

export interface SoulPreview {
  soulId: string;
  agentRole: string;
  createdAt: string;
  activeTask: string;
  lastCompleted: string;
  nextSteps: string[];
  filesModified: SoulFileTouch[];
  estimatedTokens: number;
}

export interface SoulRegistry {
  version: string;
  project: string;
  souls: Array<{
    soulId: string;
    agentId: string;
    agentRole: string;
    status: 'active' | 'consumed' | 'archived';
    createdAt: string;
    consumedAt?: string;
    consumedBy?: string;
    soulPath: string;
    estimatedTokens: number;
  }>;
}

export interface FileLock {
  lock_id: string;
  agent_id: string;
  agent_role: string;
  acquired_at: string;
  expires_at: string;
  files_locked: string[];
  task_description: string;
  soul_id?: string;
}

export interface LockConflict {
  file: string;
  existingLock: FileLock;
  severity: 'blocking' | 'warning';
}

export interface LockAcquireResult {
  success: boolean;
  lockId?: string;
  conflicts: LockConflict[];
  message: string;
}

export interface V1V8Result {
  overall: 'pass' | 'warn' | 'fail';
  gates: Array<{ gate: string; passed: boolean; evidence: string }>;
}

export interface EliteConstitution {
  laws: Record<string, string>;
  v1v8: Record<string, string>;
  responseContract: string;
  rituals: Record<string, string>;
}
