#!/usr/bin/env bash
set -euo pipefail

# swarm-delegate.sh — Orquestador delegates a task to a worker
# Usage: swarm-delegate.sh PROJECT WORKER OBJECTIVE CONTEXT
#
# Generates a unique TASK_ID, creates a JSON task file in
# ~/shared-context/{PROJECT}/bus/requests/, and prints TASK_ID.

PROJECT="${1:-}"
WORKER="${2:-}"
OBJECTIVE="${3:-}"
CONTEXT="${4:-}"

if [[ -z "$PROJECT" || -z "$WORKER" || -z "$OBJECTIVE" ]]; then
    echo "Usage: $0 PROJECT WORKER OBJECTIVE CONTEXT" >&2
    exit 1
fi

# Validate project
if [[ "$PROJECT" != "solbot" && "$PROJECT" != "polybot" ]]; then
    echo "Error: PROJECT must be 'solbot' or 'polybot'" >&2
    exit 1
fi

# Validate worker
if [[ ! "$WORKER" =~ ^worker-[1-5]$ ]]; then
    echo "Error: WORKER must be worker-1..worker-5" >&2
    exit 1
fi

BUS_DIR="$HOME/shared-context/$PROJECT/bus"
REQUESTS_DIR="$BUS_DIR/requests"
mkdir -p "$REQUESTS_DIR"

# Generate unique TASK_ID: timestamp + 8 random hex chars
TIMESTAMP=$(date -u +%Y%m%d%H%M%S)
RAND=$(openssl rand -hex 4 2>/dev/null || cat /proc/sys/kernel/random/uuid | tr -d '-' | cut -c1-8)
TASK_ID="task-${TIMESTAMP}-${RAND}"

CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Build JSON payload
PAYLOAD=$(jq -n \
    --arg id "$TASK_ID" \
    --arg worker "$WORKER" \
    --arg objective "$OBJECTIVE" \
    --arg context "$CONTEXT" \
    --arg created "$CREATED_AT" \
    '{
        id: $id,
        worker: $worker,
        objective: $objective,
        context: $context,
        constraints: [],
        input_artifacts: [],
        expected_output: "",
        success_criteria: [],
        status: "pending",
        created_at: $created,
        claimed_at: null,
        completed_at: null
    }')

# Atomic write: temp file then mv
FILENAME="${TIMESTAMP}-${TASK_ID}-${WORKER}.json"
TMP_FILE=$(mktemp -p "$REQUESTS_DIR" .tmp.XXXXXXXXXX)
echo "$PAYLOAD" > "$TMP_FILE"
chmod 600 "$TMP_FILE"
mv "$TMP_FILE" "$REQUESTS_DIR/$FILENAME"

# Verify
if [[ -f "$REQUESTS_DIR/$FILENAME" ]]; then
    echo "$TASK_ID"
else
    echo "Error: failed to create task file" >&2
    exit 1
fi
