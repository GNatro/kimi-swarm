#!/usr/bin/env bash
set -euo pipefail

SWARM_ROOT="${SWARM_ROOT:-$HOME/kimi-swarm}"
BUS_DIR="$SWARM_ROOT/bus"
PROJECTS=(solbot polybot)
MAILBOXES=(requests processing responses archive)

echo "[swarm-bus-init] Initializing Kimi Swarm message bus..."

# Create bus directories with proper structure
for project in "${PROJECTS[@]}"; do
    for mailbox in "${MAILBOXES[@]}"; do
        dir="$BUS_DIR/$project/$mailbox"
        mkdir -p "$dir"
        chmod 700 "$dir"
        echo "  ✓ $dir"
    done
done

# Create top-level README.md
cat > "$BUS_DIR/README.md" << 'EOF'
# Kimi Swarm Message Bus

Filesystem-based message bus for multi-agent orchestration.
Inspired by FCoP (File-based Coordination Protocol) and Maildir.

## Directory Layout

```
bus/
├── solbot/
│   ├── requests/    # New tasks dropped here by Orquestador
│   ├── processing/  # Tasks claimed by Workers (atomic mv)
│   ├── responses/   # Completed task results from Workers
│   └── archive/     # Final archived tasks with timestamps
└── polybot/
    └── (same structure)
```

## Protocol Rules

1. **Atomic Writes**: All task files must be written to a temp file then
   atomically renamed (`mv`) into the target directory.
2. **Atomic Claim**: Workers claim tasks by moving from `requests/` to
   `processing/` using `mv`. This is atomic on POSIX filesystems.
3. **Collision Avoidance**: Use `flock` or timestamp-based uniqueness in
   filenames to prevent collisions.
4. **Naming Convention**: `{timestamp}-{task-id}-{worker}.json`
5. **Privacy**: All directories are chmod 700.

## Scripts

- `swarm-bus-init.sh` — Initialize bus directories
- `swarm-claim.sh` — Atomically claim a task
- `swarm-archive.sh` — Archive a completed task
EOF

echo "[swarm-bus-init] Done. Bus root: $BUS_DIR"
