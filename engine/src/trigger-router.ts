/**
 * Trigger Router — Elite Role Constitution triggers for Kimi Swarm Engine
 * Detects user intent prefixes and routes to appropriate execution mode
 */

export type TriggerType = 
  | 'plan-only' 
  | 'approved' 
  | 'reject' 
  | 'light' 
  | 'challenge' 
  | 'audit' 
  | 'none';

export interface TriggerResult {
  type: TriggerType;
  cleanRequest: string;
  scope?: string;
  reason?: string;
  subject?: string;
}

/**
 * Parse a user input string to detect triggers
 * Examples:
 *   "plan only: fix auth" → { type: 'plan-only', cleanRequest: 'fix auth' }
 *   "[APPROVED]" → { type: 'approved', cleanRequest: '' }
 *   "[APPROVED] Phase A only" → { type: 'approved', cleanRequest: '', scope: 'Phase A only' }
 *   "REJECT — too risky" → { type: 'reject', cleanRequest: '', reason: 'too risky' }
 *   "light: fix typo" → { type: 'light', cleanRequest: 'fix typo' }
 *   "challenge: why 15 files?" → { type: 'challenge', cleanRequest: '', subject: 'why 15 files?' }
 *   "audit" → { type: 'audit', cleanRequest: '' }
 */
export function parseTrigger(input: string): TriggerResult {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  // 1. Plan only
  if (lower.startsWith('plan only:')) {
    return {
      type: 'plan-only',
      cleanRequest: trimmed.slice('plan only:'.length).trim(),
    };
  }

  // 2. Approved (with optional scope)
  if (lower.startsWith('[approved]')) {
    const after = trimmed.slice('[approved]'.length).trim();
    return {
      type: 'approved',
      cleanRequest: '',
      scope: after || undefined,
    };
  }

  // 3. Reject (with optional reason after em-dash or dash)
  if (lower.startsWith('reject')) {
    const after = trimmed.slice('reject'.length).trim();
    // Remove leading dash or em-dash
    const reason = after.replace(/^[—\-]\s*/, '').trim() || undefined;
    return {
      type: 'reject',
      cleanRequest: '',
      reason,
    };
  }

  // 4. Light effort
  if (lower.startsWith('light:')) {
    return {
      type: 'light',
      cleanRequest: trimmed.slice('light:'.length).trim(),
    };
  }

  // 5. Challenge
  if (lower.startsWith('challenge:')) {
    return {
      type: 'challenge',
      cleanRequest: '',
      subject: trimmed.slice('challenge:'.length).trim(),
    };
  }

  // 6. Audit
  if (lower === 'audit' || lower.startsWith('audit ')) {
    return {
      type: 'audit',
      cleanRequest: trimmed.slice('audit'.length).trim(),
    };
  }

  // No trigger detected
  return {
    type: 'none',
    cleanRequest: trimmed,
  };
}

/**
 * Check if a trigger requires a pending plan to exist
 */
export function requiresPendingPlan(trigger: TriggerType): boolean {
  return trigger === 'approved' || trigger === 'reject';
}

/**
 * Check if a trigger skips the swarm orchestration
 */
export function skipsSwarm(trigger: TriggerType): boolean {
  return trigger === 'light' || trigger === 'challenge' || trigger === 'audit';
}
