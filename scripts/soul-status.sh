#!/bin/bash
# soul-status.sh — Display active souls in a readable table
# Usage: soul-status.sh [--project NAME]
# If --project is omitted, shows all projects.

PROJECT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2;;
    --help|-h)
      echo "Usage: $(basename "$0") [--project NAME]"
      echo "  --project  Show souls for specific project only"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1;;
  esac
done

# ---------------------------------------------------------------------------
# Show souls for a single project
# ---------------------------------------------------------------------------
show_project_souls() {
  local proj="$1"
  local SOUL_REGISTRY="$HOME/shared-context/$proj/souls/registry.json"
  
  if [ ! -f "$SOUL_REGISTRY" ]; then
    return
  fi

  local total active consumed archived
  total=$(jq '.souls | length' "$SOUL_REGISTRY" 2>/dev/null || echo 0)
  active=$(jq '[.souls[] | select(.status == "active")] | length' "$SOUL_REGISTRY" 2>/dev/null || echo 0)
  consumed=$(jq '[.souls[] | select(.status == "consumed")] | length' "$SOUL_REGISTRY" 2>/dev/null || echo 0)
  archived=$(jq '[.souls[] | select(.status == "archived")] | length' "$SOUL_REGISTRY" 2>/dev/null || echo 0)

  echo ""
  echo "╔══════════════════════════════════════════════════════════════════════════════╗"
  echo "║  SOULS — $proj"
  echo "║  Total: $total │ Active: $active │ Consumed: $consumed │ Archived: $archived"
  echo "╠══════════════════════════════════════════════════════════════════════════════╣"

  if [ "$active" -gt 0 ]; then
    printf "║ %-28s │ %-16s │ %-19s ║\n" "SOUL ID" "ROLE" "CREATED"
    echo "╠══════════════════════════════════════════════════════════════════════════════╣"
    jq -r '.souls[] | select(.status == "active") | [.soulId, .agentRole, .createdAt] | @tsv' "$SOUL_REGISTRY" 2>/dev/null | while IFS=$'\t' read -r id role created; do
      printf "║ %-28s │ %-16s │ %-19s ║\n" "${id:0:28}" "${role:0:16}" "${created:0:19}"
    done
  else
    echo "║  No active souls                                                             ║"
  fi
  echo "╚══════════════════════════════════════════════════════════════════════════════╝"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if [ -n "$PROJECT" ]; then
  show_project_souls "$PROJECT"
else
  # Show all projects from registry
  REGISTRY="$HOME/.kimi/swarm-projects.json"
  if [ -f "$REGISTRY" ]; then
    while IFS= read -r proj; do
      [ -n "$proj" ] && show_project_souls "$proj"
    done < <(jq -r '.projects // {} | keys[]' "$REGISTRY" 2>/dev/null || true)
  else
    # Fallback: polybot
    show_project_souls "polybot"
  fi
fi
