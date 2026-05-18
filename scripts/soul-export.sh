#!/bin/bash
# soul-export.sh — Wrapper to trigger soul export via the Swarm Engine
# Usage: soul-export.sh [--project NAME] --agent-id ID --agent-role ROLE --reason REASON
# If --project is omitted, auto-detects using project-detector.sh

set -e

AGENT_ID=""
AGENT_ROLE="auto"
REASON="manual"
PROJECT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2;;
    --agent-id) AGENT_ID="$2"; shift 2;;
    --agent-role) AGENT_ROLE="$2"; shift 2;;
    --reason) REASON="$2"; shift 2;;
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
    PROJECT=$(echo "$DETECTED" | jq -r '.projectName // "polybot"' 2>/dev/null || echo "polybot")
  else
    PROJECT="polybot"
  fi
fi

cd "$HOME/kimi-swarm/engine"
npx tsx -e "
import { exportSoul } from './src/soul/export.ts';
exportSoul({ agentId: '$AGENT_ID', agentRole: '$AGENT_ROLE', exportReason: '$REASON', projectId: '$PROJECT' })
  .then(r => {
    console.log('SOUL EXPORTED:', r.soulId);
    console.log('Project:', '$PROJECT');
    console.log('Files:', r.filesWritten.length);
    console.log('Tokens:', r.estimatedTokens);
  })
  .catch(e => {
    console.error('SOUL EXPORT FAILED:', e.message);
    process.exit(1);
  });
"
