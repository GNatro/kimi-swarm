#!/usr/bin/env bash
set -euo pipefail

# swarm-complete.sh — Worker completes a task
# Usage: swarm-complete.sh PROJECT TASK_ID RESULT_FILE
#
# Reads task from processing/, creates response in responses/,
# archives the original task, prints confirmation.

PROJECT="${1:-}"
TASK_ID="${2:-}"
RESULT_FILE="${3:-}"

if [[ -z "$PROJECT" || -z "$TASK_ID" || -z "$RESULT_FILE" ]]; then
    echo "Usage: $0 PROJECT TASK_ID RESULT_FILE" >&2
    exit 1
fi

if [[ ! -f "$RESULT_FILE" ]]; then
    echo "Error: result file not found: $RESULT_FILE" >&2
    exit 1
fi

BUS_DIR="$HOME/shared-context/$PROJECT/bus"
PROCESSING_DIR="$BUS_DIR/processing"
RESPONSES_DIR="$BUS_DIR/responses"
ARCHIVE_DIR="$BUS_DIR/archive"

mkdir -p "$RESPONSES_DIR" "$ARCHIVE_DIR"

# Find the task file in processing/
TASK_FILE=$(find "$PROCESSING_DIR" -maxdepth 1 -type f -name "*${TASK_ID}*.json" | head -n 1)

if [[ -z "$TASK_FILE" || ! -f "$TASK_FILE" ]]; then
    echo "Error: task not found in processing: $TASK_ID" >&2
    exit 1
fi

TASK_BASENAME=$(basename "$TASK_FILE")

# Extract worker from task file
WORKER=$(jq -r '.worker // empty' "$TASK_FILE")
if [[ -z "$WORKER" ]]; then
    echo "Error: could not determine worker from task file" >&2
    exit 1
fi

# Read result content
RESULT_CONTENT=$(cat "$RESULT_FILE")

COMPLETED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Build response JSON
RESPONSE=$(jq -n \
    --arg task_id "$TASK_ID" \
    --arg worker "$WORKER" \
    --arg completed "$COMPLETED_AT" \
    --arg result "$RESULT_CONTENT" \
    '{
        task_id: $task_id,
        worker: $worker,
        summary: ($result | split("\n")[0] // ""),
        changes_made: (($result | capture("Changes made:\\s*(?<c>.*)") | .c) // ""),
        technical_notes: (($result | capture("Technical notes:\\s*(?<t>.*)") | .t) // ""),
        tests_validation: (($result | capture("Tests:\\s*(?<x>.*)") | .x) // ""),
        next_steps: (($result | capture("Next steps:\\s*(?<n>.*)") | .n) // ""),
        status: "completed",
        completed_at: $completed
    }')

# Write response atomically
RESPONSE_FILENAME="${COMPLETED_AT}-${TASK_ID}-response.json"
TMP_RESP=$(mktemp -p "$RESPONSES_DIR" .tmp.XXXXXXXXXX)
echo "$RESPONSE" > "$TMP_RESP"
chmod 600 "$TMP_RESP"
mv "$TMP_RESP" "$RESPONSES_DIR/$RESPONSE_FILENAME"

# Archive original task with timestamp
ARCHIVE_NAME="${COMPLETED_AT}-${TASK_BASENAME}"
mv "$TASK_FILE" "$ARCHIVE_DIR/$ARCHIVE_NAME"

# Update archived task status
jq --arg completed "$COMPLETED_AT" \
   --arg result_file "$RESPONSE_FILENAME" \
   '.status = "completed" | .completed_at = $completed | .result_file = $result_file' \
   "$ARCHIVE_DIR/$ARCHIVE_NAME" > /dev/null 2>&1 || true

echo "Task $TASK_ID completed by $WORKER. Response: $RESPONSE_FILENAME"
