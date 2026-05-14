#!/bin/bash
# Hook: Swarm Stop
# Called by main stop.sh
# Purpose: Detect stuck/pending tasks, check worker health

set -e

BUS_DIR="$HOME/shared-context/polybot/bus"
RESPONSES_DIR="$BUS_DIR/responses"
REQUESTS_DIR="$BUS_DIR/requests"

# Check for tasks that have been pending too long (no response in 30 min)
STUCK_TASKS=""
if [ -d "$REQUESTS_DIR" ]; then
    now=$(date +%s)
    for req in "$REQUESTS_DIR"/*.json; do
        [ -f "$req" ] || continue
        task_id=$(basename "$req" .json)
        req_time=$(stat -c %Y "$req" 2>/dev/null || echo 0)
        
        # Check if any response exists
        resp_exists=false
        if [ -d "$RESPONSES_DIR" ]; then
            if find "$RESPONSES_DIR" -name "${task_id}*-result.md" | grep -q .; then
                resp_exists=true
            fi
        fi
        
        if [ "$resp_exists" = false ]; then
            elapsed=$((now - req_time))
            if [ "$elapsed" -gt 1800 ]; then
                STUCK_TASKS="$STUCK_TASKS $task_id"
            fi
        fi
    done
fi

if [ -n "$STUCK_TASKS" ]; then
    echo ""
    echo "⚠️ SWARM WARNING: Stuck tasks detected (no response in >30 min):$STUCK_TASKS"
    echo "   Workers may have timed out. Consider re-delegating."
fi

# Clean old requests (> 24h) and their responses
if [ -d "$REQUESTS_DIR" ]; then
    now=$(date +%s)
    for req in "$REQUESTS_DIR"/*.json; do
        [ -f "$req" ] || continue
        req_time=$(stat -c %Y "$req" 2>/dev/null || echo 0)
        elapsed=$((now - req_time))
        if [ "$elapsed" -gt 86400 ]; then
            task_id=$(basename "$req" .json)
            rm -f "$req"
            rm -f "$RESPONSES_DIR/${task_id}"*-result.md
            echo "   Cleaned old task: $task_id"
        fi
    done
fi
