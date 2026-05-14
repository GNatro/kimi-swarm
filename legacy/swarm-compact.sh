#!/usr/bin/env bash
set -euo pipefail

# swarm-compact.sh — Super-Orquestador compaction
# Usage: swarm-compact.sh PROJECT
#
# Reads 01-active-context.md. If file size > ~15k tokens (approx 60000 chars),
# generates a compact seed preserving: current tasks, blockers, decisions,
# next steps. Removes detailed code and conversation history.
# Archives old version and logs event to 00-master-context.md.

PROJECT="${1:-}"

if [[ -z "$PROJECT" ]]; then
    echo "Usage: $0 PROJECT" >&2
    exit 1
fi

CTX_DIR="$HOME/shared-context/$PROJECT"
ACTIVE_CTX="$CTX_DIR/01-active-context.md"
MASTER_CTX="$CTX_DIR/00-master-context.md"
SNAPSHOTS_DIR="$CTX_DIR/05-snapshots"

if [[ ! -f "$ACTIVE_CTX" ]]; then
    echo "Error: active context not found: $ACTIVE_CTX" >&2
    exit 1
fi

mkdir -p "$SNAPSHOTS_DIR"

# Approximate token count: 1 token ≈ 4 characters for English text
FILE_CHARS=$(wc -c < "$ACTIVE_CTX" | tr -d ' ')
TOKEN_APPROX=$((FILE_CHARS / 4))
TOKEN_THRESHOLD=15000

if [[ "$TOKEN_APPROX" -le "$TOKEN_THRESHOLD" ]]; then
    echo "[swarm-compact] $PROJECT active context is ${TOKEN_APPROX} tokens (≤ ${TOKEN_THRESHOLD}). No compaction needed."
    exit 0
fi

echo "[swarm-compact] $PROJECT active context is ${TOKEN_APPROX} tokens (> ${TOKEN_THRESHOLD}). Compacting..."

TIMESTAMP=$(date -u +%Y%m%d%H%M%S)
ISO_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
ARCHIVE_NAME="01-active-context-${TIMESTAMP}.md"

# Archive current version
cp "$ACTIVE_CTX" "$SNAPSHOTS_DIR/$ARCHIVE_NAME"

# Extract preserved sections using awk-like parsing with sed/grep
# We preserve: Current Focus, Blockers, Decisions/Next Steps, Session State
# We discard: detailed code blocks, conversation history, long logs

extract_section() {
    local file="$1"
    local header="$2"
    awk -v header="$header" '
        BEGIN { found=0 }
        $0 ~ "^## " { if (found) exit; if ($0 ~ header) found=1 }
        found { print }
    ' "$file" 2>/dev/null || true
}

# Build compact seed
cat > "$ACTIVE_CTX" << EOF
# $(echo "$PROJECT" | tr '[:lower:]' '[:upper:]') ACTIVE CONTEXT
<!-- SEED: ${ISO_TIMESTAMP} -->
<!-- COMPACTED: ${TOKEN_APPROX} tokens → reduced seed -->
<!-- Orquestador lee esto al arrancar -->
EOF

# Preserve Current Focus
SECTION=$(extract_section "$SNAPSHOTS_DIR/$ARCHIVE_NAME" "Current Focus")
if [[ -n "$SECTION" ]]; then
    echo "" >> "$ACTIVE_CTX"
    echo "$SECTION" >> "$ACTIVE_CTX"
fi

# Preserve Session State (brief)
SECTION=$(extract_section "$SNAPSHOTS_DIR/$ARCHIVE_NAME" "Session State")
if [[ -n "$SECTION" ]]; then
    echo "" >> "$ACTIVE_CTX"
    echo "$SECTION" >> "$ACTIVE_CTX"
fi

# Preserve Blockers
SECTION=$(extract_section "$SNAPSHOTS_DIR/$ARCHIVE_NAME" "Blockers")
if [[ -n "$SECTION" ]]; then
    echo "" >> "$ACTIVE_CTX"
    echo "$SECTION" >> "$ACTIVE_CTX"
else
    echo "" >> "$ACTIVE_CTX"
    echo "## Blockers" >> "$ACTIVE_CTX"
    echo "- None active" >> "$ACTIVE_CTX"
fi

# Preserve Decisions
SECTION=$(extract_section "$SNAPSHOTS_DIR/$ARCHIVE_NAME" "Decisions")
if [[ -n "$SECTION" ]]; then
    echo "" >> "$ACTIVE_CTX"
    echo "$SECTION" >> "$ACTIVE_CTX"
fi

# Preserve Next Steps
SECTION=$(extract_section "$SNAPSHOTS_DIR/$ARCHIVE_NAME" "Next Steps")
if [[ -n "$SECTION" ]]; then
    echo "" >> "$ACTIVE_CTX"
    echo "$SECTION" >> "$ACTIVE_CTX"
fi

# Add compaction notice
cat >> "$ACTIVE_CTX" << EOF

## Compaction Log
- **Date**: ${ISO_TIMESTAMP}
- **Original size**: ~${TOKEN_APPROX} tokens
- **Reason**: Active context exceeded ${TOKEN_THRESHOLD} tokens
- **Preserved**: Current focus, session state, blockers, decisions, next steps
- **Removed**: Detailed code, full conversation history, completed task details
- **Archive**: 05-snapshots/${ARCHIVE_NAME}
EOF

# Log to master context
if [[ -f "$MASTER_CTX" ]]; then
    # Append compaction event
    {
        echo ""
        echo "## Compaction Event — ${ISO_TIMESTAMP}"
        echo "- **Project**: ${PROJECT}"
        echo "- **Original tokens**: ~${TOKEN_APPROX}"
        echo "- **Archive**: 05-snapshots/${ARCHIVE_NAME}"
        echo "- **Trigger**: Size threshold (${TOKEN_THRESHOLD} tokens) exceeded"
    } >> "$MASTER_CTX"
fi

NEW_CHARS=$(wc -c < "$ACTIVE_CTX" | tr -d ' ')
NEW_TOKENS=$((NEW_CHARS / 4))

echo "[swarm-compact] Compacted ${PROJECT}: ~${TOKEN_APPROX} tokens → ~${NEW_TOKENS} tokens."
echo "[swarm-compact] Archive: $SNAPSHOTS_DIR/$ARCHIVE_NAME"
