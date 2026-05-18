#!/bin/bash
# soul-import.sh — Wrapper to trigger soul import via the Swarm Engine
# Usage: soul-import.sh [--project NAME] [--soul-id ID] --agent-id ID --agent-role ROLE
# If --project is provided, filters pending souls to that project.

set -e

SOUL_ID=""
AGENT_ID=""
AGENT_ROLE="auto"
PROJECT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2;;
    --soul-id) SOUL_ID="$2"; shift 2;;
    --agent-id) AGENT_ID="$2"; shift 2;;
    --agent-role) AGENT_ROLE="$2"; shift 2;;
    *) echo "Unknown option: $1" >&2; exit 1;;
  esac
done

if [ -z "$AGENT_ID" ]; then
  AGENT_ID="$(hostname)-$$"
fi

# Auto-detect project if not provided
if [ -z "$PROJECT" ]; then
  if [ -x "$HOME/brain-stack-repo/hooks/project-detector.sh" ]; then
    DETECTED=$(bash "$HOME/brain-stack-repo/hooks/project-detector.sh" 2>/dev/null || echo "{}")
    PROJECT=$(echo "$DETECTED" | jq -r '.projectName // empty' 2>/dev/null)
  fi
fi

cd "$HOME/kimi-swarm/engine"

if [ -z "$SOUL_ID" ]; then
  # List pending souls (filtered by project if provided)
  npx tsx -e "
import { findPendingSouls } from './src/soul/import.ts';
const projectId = '$PROJECT' || undefined;
findPendingSouls(projectId)
  .then(souls => {
    if (souls.length === 0) {
      console.log('No pending souls found.' + (projectId ? ' (project: ' + projectId + ')' : ''));
      return;
    }
    console.log('PENDING SOULS' + (projectId ? ' for ' + projectId : '') + ':');
    souls.forEach((s, i) => {
      console.log(\`  \${i + 1}. \${s.soul_id} | \${s.agent_role} | \${s.created_at}\`);
    });
  })
  .catch(e => {
    console.error('ERROR:', e.message);
    process.exit(1);
  });
"
else
  npx tsx -e "
import { importSoul } from './src/soul/import.ts';
const projectId = '$PROJECT' || undefined;
importSoul('$SOUL_ID', { agentId: '$AGENT_ID', agentRole: '$AGENT_ROLE', projectId })
  .then(r => {
    console.log('SOUL IMPORT:', r.status);
    console.log('Hydrated:', r.hydratedPath);
    if (r.warnings.length > 0) console.log('Warnings:', r.warnings.join('; '));
    console.log('Next steps:', r.nextSteps.join(', '));
  })
  .catch(e => {
    console.error('SOUL IMPORT FAILED:', e.message);
    process.exit(1);
  });
"
fi
