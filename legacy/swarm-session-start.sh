#!/bin/bash
# Hook: Swarm Session Start
# Purpose: Detect swarm role and show bus status

SWARM_DIR="$HOME/kimi-swarm"
BUS_DIR="$HOME/shared-context"

# Detect project from git root or cwd
PROJECT="general"
if git rev-parse --show-toplevel >/dev/null 2>&1; then
    PROJECT=$(basename "$(git rev-parse --show-toplevel)")
fi

# Check if this project has a swarm bus
if [ -d "$BUS_DIR/$PROJECT/bus" ]; then
    echo ""
    echo "🐝 KIMI SWARM — Project: $PROJECT"
    
    # Show bus status
    PENDING=$(ls "$BUS_DIR/$PROJECT/bus/requests/"/*.json 2>/dev/null | wc -l)
    ACTIVE=$(ls "$BUS_DIR/$PROJECT/bus/processing/"/*.json 2>/dev/null | wc -l)
    READY=$(ls "$BUS_DIR/$PROJECT/bus/responses/"/*.json 2>/dev/null | wc -l)
    
    echo "  📥 Pending: $PENDING | 🔄 Active: $ACTIVE | ✅ Ready: $READY"
    
    if [ "$PENDING" -gt 0 ] || [ "$ACTIVE" -gt 0 ] || [ "$READY" -gt 0 ]; then
        echo "  Use: swarm-status.sh $PROJECT"
    fi
    
    # Show active tasks
    if [ "$ACTIVE" -gt 0 ]; then
        echo "  Active tasks:"
        for f in "$BUS_DIR/$PROJECT/bus/processing/"/*.json; do
            [ -f "$f" ] || continue
            OBJ=$(jq -r '.objective // "unknown"' "$f" 2>/dev/null)
            WKR=$(jq -r '.worker // "unknown"' "$f" 2>/dev/null)
            echo "    - [$WKR] $OBJ"
        done
    fi
    
    # Show ready responses
    if [ "$READY" -gt 0 ]; then
        echo "  ⚠️  READY responses waiting for integration:"
        for f in "$BUS_DIR/$PROJECT/bus/responses/"/*.json; do
            [ -f "$f" ] || continue
            TID=$(jq -r '.task_id // "unknown"' "$f" 2>/dev/null)
            WKR=$(jq -r '.worker // "unknown"' "$f" 2>/dev/null)
            echo "    - [$TID] $WKR"
        done
        echo "  👉 Run: swarm-status.sh $PROJECT to integrate"
    fi
fi
