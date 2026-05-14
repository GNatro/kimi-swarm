#!/usr/bin/env bash
set -euo pipefail

# swarm-status.sh — Show status of all workers and the message bus
# Usage: swarm-status.sh [PROJECT]
#
# Lists counts and active/ready tasks. Color-coded if terminal supports it.

PROJECT="${1:-}"

# Color codes (safe — only used when stdout is a TTY)
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    RESET='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' CYAN='' BOLD='' RESET=''
fi

PROJECTS=(solbot polybot)
if [[ -n "$PROJECT" ]]; then
    PROJECTS=("$PROJECT")
fi

for p in "${PROJECTS[@]}"; do
    BUS_DIR="$HOME/shared-context/$p/bus"

    if [[ ! -d "$BUS_DIR" ]]; then
        echo -e "${RED}Project '$p' bus directory not found.${RESET}"
        continue
    fi

    REQ_DIR="$BUS_DIR/requests"
    PROC_DIR="$BUS_DIR/processing"
    RESP_DIR="$BUS_DIR/responses"
    ARCH_DIR="$BUS_DIR/archive"

    REQ_COUNT=$(find "$REQ_DIR" -maxdepth 1 -type f -name "*.json" 2>/dev/null | wc -l)
    PROC_COUNT=$(find "$PROC_DIR" -maxdepth 1 -type f -name "*.json" 2>/dev/null | wc -l)
    RESP_COUNT=$(find "$RESP_DIR" -maxdepth 1 -type f -name "*.json" 2>/dev/null | wc -l)
    ARCH_COUNT=$(find "$ARCH_DIR" -maxdepth 1 -type f -name "*.json" 2>/dev/null | wc -l)

    echo -e "${BOLD}━━━ $p ━━━${RESET}"
    echo -e "  ${CYAN}Pending requests:${RESET}  $REQ_COUNT"
    echo -e "  ${YELLOW}Active (processing):${RESET} $PROC_COUNT"
    echo -e "  ${GREEN}Ready (responses):${RESET}   $RESP_COUNT"
    echo -e "  ${BLUE}Archived:${RESET}            $ARCH_COUNT"

    # Active tasks
    if [[ "$PROC_COUNT" -gt 0 ]]; then
        echo -e "\n  ${YELLOW}▶ Active tasks:${RESET}"
        find "$PROC_DIR" -maxdepth 1 -type f -name "*.json" -print0 2>/dev/null | \
            while IFS= read -r -d '' f; do
                id=$(jq -r '.id // "unknown"' "$f")
                worker=$(jq -r '.worker // "unknown"' "$f")
                objective=$(jq -r '.objective // ""' "$f" | cut -c1-60)
                claimed=$(jq -r '.claimed_at // "N/A"' "$f")
                printf "    %-20s %-10s %-25s %s\n" "$id" "$worker" "[$claimed]" "$objective"
            done
    fi

    # Ready responses
    if [[ "$RESP_COUNT" -gt 0 ]]; then
        echo -e "\n  ${GREEN}▶ Ready responses:${RESET}"
        find "$RESP_DIR" -maxdepth 1 -type f -name "*.json" -print0 2>/dev/null | \
            while IFS= read -r -d '' f; do
                tid=$(jq -r '.task_id // "unknown"' "$f")
                worker=$(jq -r '.worker // "unknown"' "$f")
                summary=$(jq -r '.summary // ""' "$f" | cut -c1-60)
                completed=$(jq -r '.completed_at // "N/A"' "$f")
                printf "    %-20s %-10s %-25s %s\n" "$tid" "$worker" "[$completed]" "$summary"
            done
    fi

    echo ""
done
