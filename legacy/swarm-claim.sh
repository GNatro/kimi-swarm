#!/usr/bin/env bash
set -euo pipefail

# swarm-claim.sh — Atomically claim a task for a worker
# Usage: swarm-claim.sh PROJECT WORKER
#
# Finds the oldest unclaimed task for WORKER in requests/ and
# atomically moves it to processing/.
# Prints the claimed task JSON to stdout, or nothing if no task.

PROJECT="${1:-}"
WORKER="${2:-}"

if [[ -z "$PROJECT" || -z "$WORKER" ]]; then
    echo "Usage: $0 PROJECT WORKER" >&2
    exit 1
fi

BUS_DIR="$HOME/shared-context/$PROJECT/bus"
REQUESTS_DIR="$BUS_DIR/requests"
PROCESSING_DIR="$BUS_DIR/processing"

if [[ ! -d "$REQUESTS_DIR" ]]; then
    echo "Error: requests directory does not exist: $REQUESTS_DIR" >&2
    exit 1
fi

# Find the oldest task file for this worker (sorted by filename = timestamp order)
# Filenames are expected: {timestamp}-{task-id}-{worker}.json
mapfile -t candidates < <(find "$REQUESTS_DIR" -maxdepth 1 -type f -name "*.json" | sort)

for src in "${candidates[@]}"; do
    # Quick check: filename contains worker name
    basename_src=$(basename "$src")
    if [[ "$basename_src" == *"${WORKER}"* ]]; then
        dest="$PROCESSING_DIR/$basename_src"

        # Atomic claim via mv (POSIX-atomic for same filesystem)
        if mv "$src" "$dest" 2>/dev/null; then
            # Update status and claimed_at inside the file atomically
            tmp=$(mktemp)
            jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
               '.status = "processing" | .claimed_at = $now' "$dest" > "$tmp"
            mv "$tmp" "$dest"

            cat "$dest"
            exit 0
        fi
    fi
done

# No task found — exit silently with code 1
exit 1
