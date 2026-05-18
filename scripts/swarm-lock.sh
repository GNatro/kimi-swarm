#!/bin/bash
# swarm-lock.sh — Manage swarm file locks
# Usage: swarm-lock.sh {acquire|release|status|check|cleanup} [options]

set -e

COMMAND="${1:-status}"
shift || true

AGENT_ID="${SWARM_AGENT_ID:-$(hostname)-$$}"
PROJECT=""

# Parse global options before command-specific ones
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2;;
    --agent-id) AGENT_ID="$2"; shift 2;;
    --file|--task|--lock-id) break;;  # Command-specific, stop here
    *) break;;
  esac
done

# Auto-detect project if not provided
if [ -z "$PROJECT" ]; then
  if [ -x "$HOME/brain-stack-repo/hooks/project-detector.sh" ]; then
    DETECTED=$(bash "$HOME/brain-stack-repo/hooks/project-detector.sh" 2>/dev/null || echo "{}")
    PROJECT=$(echo "$DETECTED" | jq -r '.projectName // "polybot"' 2>/dev/null || echo "polybot")
  else
    PROJECT="polybot"
  fi
fi

LOCK_DIR="$HOME/shared-context/$PROJECT/bus/locks"

case "$COMMAND" in
  acquire)
    FILES=""
    TASK=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --file) FILES="$FILES\"$2\","; shift 2;;
        --task) TASK="$2"; shift 2;;
        --agent-id) AGENT_ID="$2"; shift 2;;
        *) shift;;
      esac
    done
    if [ -z "$FILES" ]; then
      echo "Usage: swarm-lock.sh acquire --file <path> [--file <path>...] --task <desc> [--project NAME]"
      exit 1
    fi
    FILES="[${FILES%,}]"
    cd "$HOME/kimi-swarm/engine"
    npx tsx -e "
import { acquireLock } from './src/swarm/lock-manager.ts';
const r = acquireLock('$AGENT_ID', $FILES, { projectId: '$PROJECT', taskDescription: '$TASK' });
console.log(r.success ? 'LOCK ACQUIRED:' : 'LOCK FAILED:', r.message);
if (r.lockId) console.log('Lock ID:', r.lockId);
if (r.conflicts.length > 0) {
  r.conflicts.forEach(c => console.log('  CONFLICT:', c.file, '-', c.existingLock.agent_id));
}
"
    ;;

  release)
    LOCK_ID=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --lock-id) LOCK_ID="$2"; shift 2;;
        *) shift;;
      esac
    done
    if [ -z "$LOCK_ID" ]; then
      echo "Usage: swarm-lock.sh release --lock-id <id>"
      exit 1
    fi
    cd "$HOME/kimi-swarm/engine"
    npx tsx -e "
import { releaseLock } from './src/swarm/lock-manager.ts';
const ok = releaseLock('$LOCK_ID');
console.log(ok ? 'LOCK RELEASED' : 'LOCK NOT FOUND');
"
    ;;

  status)
    cd "$HOME/kimi-swarm/engine"
    npx tsx -e "
import { listActiveLocks } from './src/swarm/lock-manager.ts';
const locks = listActiveLocks('$PROJECT');
if (locks.length === 0) {
  console.log('No active locks for project: $PROJECT');
} else {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                         ACTIVE SWARM LOCKS — $PROJECT                        ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
  console.log('║ ID                           │ AGENT      │ EXPIRES              │ FILES     ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
  locks.forEach(l => {
    const id = l.lock_id.slice(0, 28).padEnd(28);
    const agent = l.agent_id.slice(0, 10).padEnd(10);
    const expires = l.expires_at.slice(0, 19).padEnd(19);
    const files = String(l.files_locked.length).padEnd(9);
    console.log(\`║ \${id} │ \${agent} │ \${expires} │ \${files} ║\`);
  });
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
}
"
    ;;

  check)
    FILES=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --file) FILES="$FILES\"$2\","; shift 2;;
        *) shift;;
      esac
    done
    if [ -z "$FILES" ]; then
      echo "Usage: swarm-lock.sh check --file <path> [--file <path>...] [--project NAME]"
      exit 1
    fi
    FILES="[${FILES%,}]"
    cd "$HOME/kimi-swarm/engine"
    npx tsx -e "
import { checkConflicts } from './src/swarm/lock-manager.ts';
const conflicts = checkConflicts($FILES, '$PROJECT');
if (conflicts.length === 0) {
  console.log('No conflicts found for project: $PROJECT');
} else {
  console.log('CONFLICTS:', conflicts.length);
  conflicts.forEach(c => console.log('  -', c.file, '(', c.severity, 'by', c.existingLock.agent_id + ')'));
}
"
    ;;

  cleanup)
    cd "$HOME/kimi-swarm/engine"
    npx tsx -e "
import { cleanupExpiredLocks } from './src/swarm/lock-manager.ts';
const n = cleanupExpiredLocks('$PROJECT');
console.log('Cleaned', n, 'expired locks for project: $PROJECT');
"
    ;;

  *)
    echo "Usage: swarm-lock.sh {acquire|release|status|check|cleanup} [options]"
    echo ""
    echo "  acquire --file <path> [--file <path>...] --task <description> [--project NAME]"
    echo "  release --lock-id <id>"
    echo "  status [--project NAME]"
    echo "  check --file <path> [--file <path>...] [--project NAME]"
    echo "  cleanup [--project NAME]"
    exit 1
    ;;
esac
