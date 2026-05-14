#!/usr/bin/env bash
set -euo pipefail

SWARM_ROOT="${SWARM_ROOT:-$HOME/kimi-swarm}"

usage() {
    echo "Usage: $0 <PROJECT> <TASK_ID>"
    echo "  PROJECT: solbot | polybot"
    echo "  TASK_ID: the task identifier"
    exit 1
}

if [[ $# -lt 2 ]]; then
    usage
fi

PROJECT="$1"
TASK_ID="$2"

if [[ "$PROJECT" != "solbot" && "$PROJECT" != "polybot" ]]; then
    echo "Error: PROJECT must be 'solbot' or 'polybot'" >&2
    exit 1
fi

RESPONSES_DIR="$SWARM_ROOT/bus/$PROJECT/responses"
ARCHIVE_DIR="$SWARM_ROOT/bus/$PROJECT/archive"

if [[ ! -d "$RESPONSES_DIR" ]]; then
    echo "Error: Responses directory does not exist: $RESPONSES_DIR" >&2
    exit 1
fi

if [[ ! -d "$ARCHIVE_DIR" ]]; then
    mkdir -p "$ARCHIVE_DIR"
    chmod 700 "$ARCHIVE_DIR"
fi

# Find the task file in responses
TASK_FILE=$(find "$RESPONSES_DIR" -maxdepth 1 -type f -name "*-${TASK_ID}-*.json" -print -quit 2>/dev/null || true)

if [[ -z "$TASK_FILE" ]]; then
    TASK_FILE=$(find "$RESPONSES_DIR" -maxdepth 1 -type f -name "*${TASK_ID}*.json" -print -quit 2>/dev/null || true)
fi

if [[ -z "$TASK_FILE" ]]; then
    echo "Error: Task not found in responses: $TASK_ID" >&2
    exit 2
fi

BASENAME=$(basename "$TASK_FILE")
ARCHIVE_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ARCHIVE_NAME="${ARCHIVE_TIMESTAMP}_${BASENAME}"
SOURCE="$RESPONSES_DIR/$BASENAME"
DEST="$ARCHIVE_DIR/$ARCHIVE_NAME"

# Use a lock file for collision avoidance per project
LOCK_FILE="$SWARM_ROOT/bus/$PROJECT/.archive.lock"
(
    if command -v flock >/dev/null 2>&1; then
        flock -x -w 5 200 || { echo "Error: Could not acquire archive lock" >&2; exit 3; }
    fi

    if [[ ! -f "$SOURCE" ]]; then
        echo "Error: Task already archived or removed: $TASK_ID" >&2
        exit 4
    fi

    if ! mv "$SOURCE" "$DEST"; then
        echo "Error: Failed to archive task: $TASK_ID" >&2
        exit 5
    fi

    echo "$DEST"
) 200>"$LOCK_FILE"
