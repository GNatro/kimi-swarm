# 🐝 Kimi Swarm

Multi-agent orchestration system for Kimi CLI. Distributes the 262k token context window across ephemeral worker subagents using the filesystem as a message bus.

## Architecture

```
Usuario → Orquestador (1 CLI, user interacts here)
    ↓ Agent(tool="worker-X")
Worker subagent (262k tokens, ephemeral)
    ↓ Writes result
~/shared-context/{project}/bus/ (filesystem message bus)
```

## Quick Start

```bash
# 1. Initialize bus
~/kimi-swarm/scripts/swarm-bus-init.sh

# 2. Delegate task (as Orquestador)
~/kimi-swarm/scripts/swarm-delegate.sh solbot worker-1 "Fix bug" "Context here"

# 3. Worker claims task
~/kimi-swarm/scripts/swarm-claim.sh solbot {task-id}

# 4. Worker completes task
~/kimi-swarm/scripts/swarm-complete.sh solbot {task-id} /path/to/result.txt

# 5. Orquestador checks status
~/kimi-swarm/scripts/swarm-status.sh solbot
```

## Scripts

| Script | Purpose |
|--------|---------|
| `swarm-delegate.sh` | Orquestador creates task in `requests/` |
| `swarm-claim.sh` | Worker atomically claims task (requests → processing) |
| `swarm-complete.sh` | Worker delivers result (processing → responses + archive) |
| `swarm-status.sh` | Show all task states |
| `swarm-watch.sh` | Worker polls for tasks |
| `swarm-compact.sh` | Compact context when >200k tokens |
| `swarm-archive.sh` | Archive old completed tasks |

## Filesystem Bus

Atomic rename protocol (Maildir-style):
```
requests/ → processing/ (atomic mv) → responses/ → archive/
```

No locks, no daemon, no Redis. Just `mv`.

## Templates

- `worker-brief.json.template` — 200-500 token structured context
- `worker-report.md.template` — Worker delivery format
- `context-seed.md.template` — Post-compaction context

## Hooks

- `swarm-session-start.sh` — Show pending/active/ready tasks on session start
- `swarm-stop.sh` — Alert if tasks are stuck when session ends

## Projects

- `solbot/` — Solana Spider v7.0
- `polybot/` — Polymarket Copy Betting

## Research Basis

- Claude Code Swarm Mode (Anthropic, 2026)
- FCoP — File-based Coordination Protocol
- abq — Agent Bus Queue (atomic rename)
