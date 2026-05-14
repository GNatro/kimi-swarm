#!/bin/bash
# Hook: Swarm Session Start
# Called by main session-start.sh for polybot/solbot projects
# Purpose: Check bus status, remind about pending integrations

set -e

LOG_DIR="$HOME/.kimi/logs/swarm"
mkdir -p "$LOG_DIR"

BUS_DIR="$HOME/shared-context/polybot/bus"
RESPONSES_DIR="$BUS_DIR/responses"
REQUESTS_DIR="$BUS_DIR/requests"

PENDING_COUNT=0
READY_COUNT=0

# Check for pending tasks
if [ -d "$REQUESTS_DIR" ]; then
    for req in "$REQUESTS_DIR"/*.json; do
        [ -f "$req" ] || continue
        task_id=$(basename "$req" .json)
        
        # Count responses for this task
        resp_count=0
        if [ -d "$RESPONSES_DIR" ]; then
            resp_count=$(find "$RESPONSES_DIR" -name "${task_id}*-result.md" | wc -l)
        fi
        
        # Read expected subtask count (minimum 1)
        expected=1
        if command -v jq >/dev/null 2>&1; then
            expected=$(jq '.subtasks | length // 1' "$req" 2>/dev/null || echo 1)
            if [ "$expected" -lt 1 ]; then
                expected=1
            fi
        fi
        
        # Check if already integrated (integration plan exists)
        already_integrated=false
        if [ -f "$BUS_DIR/integration-plans/${task_id}-integration.md" ]; then
            already_integrated=true
        fi
        # Also check task- prefix variants
        if [ -f "$BUS_DIR/integration-plans/${task_id#*-}-integration.md" ]; then
            already_integrated=true
        fi
        
        if [ "$already_integrated" = true ]; then
            : # Already integrated, don't count
        elif [ "$resp_count" -ge "$expected" ]; then
            READY_COUNT=$((READY_COUNT + 1))
        else
            PENDING_COUNT=$((PENDING_COUNT + 1))
        fi
    done
fi

# Output status
echo ""
echo "🐝 SWARM BUS STATUS"
if [ "$READY_COUNT" -gt 0 ]; then
    echo "   ✅ $READY_COUNT task(s) ready for integration"
    echo "   Run: cd ~/kimi-swarm/engine && npx tsx src/integration/auto-integrate.ts"
fi
if [ "$PENDING_COUNT" -gt 0 ]; then
    echo "   ⏳ $PENDING_COUNT task(s) pending worker responses"
fi
if [ "$READY_COUNT" -eq 0 ] && [ "$PENDING_COUNT" -eq 0 ]; then
    echo "   📭 Bus is empty"
fi

# Check for emergency delegate flag
if [ -f "$HOME/.kimi/state/emergency-delegate.json" ]; then
    echo ""
    echo "🚨 EMERGENCY DELEGATE FLAG DETECTED"
    echo "   Previous session was interrupted near context limit."
    echo "   Run the partition engine and delegate remaining work BEFORE starting new tasks."
    echo ""
    cat "$HOME/.kimi/state/emergency-delegate.json" | jq -r '.message // "See file for details"' 2>/dev/null || true
fi

# Check integration-plans directory
PLANS_DIR="$BUS_DIR/integration-plans"
if [ -d "$PLANS_DIR" ]; then
    PLAN_COUNT=$(find "$PLANS_DIR" -name "*.md" | wc -l)
    if [ "$PLAN_COUNT" -gt 0 ]; then
        echo ""
        echo "📋 $PLAN_COUNT integration plan(s) available:"
        ls -1 "$PLANS_DIR"/*.md | sed 's/^/   /'
    fi
fi

echo ""
