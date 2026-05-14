#!/usr/bin/env bash
set -uo pipefail

# swarm-watch.sh — Worker waits for and claims tasks
# Usage: swarm-watch.sh PROJECT WORKER
#
# Polls requests/ every 2 seconds. Claims the first matching task
# via swarm-claim.sh, prints its JSON, and exits.
# Times out after 60 seconds.

PROJECT="${1:-}"
WORKER="${2:-}"

if [[ -z "$PROJECT" || -z "$WORKER" ]]; then
    echo "Usage: $0 PROJECT WORKER" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAIM_SCRIPT="$SCRIPT_DIR/swarm-claim.sh"

if [[ ! -x "$CLAIM_SCRIPT" ]]; then
    echo "Error: swarm-claim.sh not found or not executable at $CLAIM_SCRIPT" >&2
    exit 1
fi

REQUESTS_DIR="$HOME/shared-context/$PROJECT/bus/requests"
if [[ ! -d "$REQUESTS_DIR" ]]; then
    echo "Error: requests directory does not exist: $REQUESTS_DIR" >&2
    exit 1
fi

TIMEOUT=60
ELAPSED=0
INTERVAL=2

echo "[swarm-watch] $WORKER waiting for tasks in $PROJECT... (timeout: ${TIMEOUT}s)" >&2

while true; do
    # Attempt to claim a task
    if RESULT=$("$CLAIM_SCRIPT" "$PROJECT" "$WORKER" 2>/dev/null); then
        if [[ -n "$RESULT" ]]; then
            echo "$RESULT"
            exit 0
        fi
    fi

    sleep "$INTERVAL"
    ELAPSED=$((ELAPSED + INTERVAL))

    if [[ "$ELAPSED" -ge "$TIMEOUT" ]]; then
        echo "[swarm-watch] Timeout: no task claimed after ${TIMEOUT}s" >&2
        exit 124
    fi
done
