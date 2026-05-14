#!/bin/bash
# Hook: Swarm Stop
# Purpose: Persist swarm state and alert if tasks are stuck

SWARM_DIR="$HOME/kimi-swarm"
BUS_DIR="$HOME/shared-context"
STATE_DIR="$HOME/.kimi/state"

# Detect project
PROJECT="general"
if git rev-parse --show-toplevel >/dev/null 2>&1; then
    PROJECT=$(basename "$(git rev-parse --show-toplevel)")
fi

if [ -d "$BUS_DIR/$PROJECT/bus" ]; then
    ACTIVE=$(ls "$BUS_DIR/$PROJECT/bus/processing/"/*.json 2>/dev/null | wc -l)
    READY=$(ls "$BUS_DIR/$PROJECT/bus/responses/"/*.json 2>/dev/null | wc -l)
    
    if [ "$ACTIVE" -gt 0 ]; then
        echo ""
        echo "⚠️  SWARM ALERT: $ACTIVE task(s) still active in $PROJECT"
        echo "   These tasks may need recovery on next session."
        # Persist to state file
        echo "$ACTIVE" > "$STATE_DIR/swarm-active-$PROJECT.txt"
    fi
    
    if [ "$READY" -gt 0 ]; then
        echo ""
        echo "📬 SWARM NOTICE: $READY response(s) ready for integration in $PROJECT"
        echo "   Run: swarm-status.sh $PROJECT on next session."
    fi
fi
