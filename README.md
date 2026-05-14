# 🐝 Kimi Swarm Engine

> Automatic context partitioning and multi-agent delegation for Kimi CLI.
> Version: 0.2.0

---

## What is this?

Kimi Swarm is a system that automatically splits large programming tasks into smaller chunks and delegates them to worker agents. It protects the orchestrator (you) from context overflow by offloading heavy work to specialized workers.

**Problem it solves:**
- Kimi CLI has a ~262k token context window
- Polybot is ~528k tokens — too large for one agent
- Working on large tasks causes context compaction and lost work
- Manual delegation is error-prone and inconsistent

**Solution:**
- Auto-detect which project services a task touches
- Partition work into ~100k token chunks
- Generate worker prompts automatically
- Delegate to `Agent(subagent_type="coder")` workers
- Auto-integrate results and run tests

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     USER REQUEST                             │
│  "Fix dashboard onPause bug"                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              SWARM ORCHESTRATOR (you)                        │
│  - Read instructions                                         │
│  - Run partition engine                                      │
│  - Delegate to workers                                       │
│  - Integrate results                                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              PARTITION ENGINE                                │
│  Input: user request                                         │
│  Output: list of context chunks                              │
│                                                              │
│  1. Parse request keywords                                   │
│  2. Match services in project map                            │
│  3. Sum token estimates                                      │
│  4. If >120k tokens → split into chunks                      │
│  5. Generate brief per chunk                                 │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   WORKER 1      │ │   WORKER 2      │ │   WORKER N      │
│  (allocation)   │ │   (dashboard)   │ │   (telegram)    │
│                 │ │                 │ │                 │
│  • Reads files  │ │  • Reads files  │ │  • Reads files  │
│  • Implements   │ │  • Implements   │ │  • Implements   │
│  • Writes tests │ │  • Writes tests │ │  • Writes tests │
│  • Saves result │ │  • Saves result │ │  • Saves result │
└─────────────────┘ └─────────────────┘ └─────────────────┘
              │               │               │
              └───────────────┼───────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              INTEGRATION LAYER                               │
│  - Read all worker results                                   │
│  - Detect conflicts (same file modified by 2 workers)        │
│  - Generate integration plan                                 │
│  - Apply changes to project                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              VALIDATION                                      │
│  - Run TypeScript build                                      │
│  - Run affected tests                                        │
│  - Verify no regressions                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              COMMIT & KNOWLEDGE                              │
│  - git commit --no-verify                                    │
│  - git push --no-verify                                      │
│  - Save knowledge to ~/.kimi/knowledge/                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- Kimi CLI with `Agent()` tool support
- Git

### Install

```bash
git clone https://github.com/GNatro/kimi-swarm.git
cd kimi-swarm/engine
npm install
```

### Index your project

```bash
cd kimi-swarm/engine
npx tsx src/polybot-context/build-map.ts
```

This generates `src/polybot-context/map.json` with all services, files, and token estimates.

### Run a task

```bash
cd kimi-swarm/engine
npx tsx bin/swarm-orchestrate.ts "Your task description here"
```

### Read the generated prompt

```bash
cat ~/shared-context/polybot/bus/prompts/task-XXX-single.md
```

### Delegate to worker

In Kimi CLI:
```
Agent(subagent_type="coder", prompt="<contents of prompt file>")
```

### After workers finish

```bash
# Check status
cd kimi-swarm/engine && npx tsx src/integration/auto-integrate.ts --list

# Integrate results
cd kimi-swarm/engine && npx tsx src/integration/auto-integrate.ts task-XXX

# Run tests
cd kimi-swarm/engine && npx tsx src/integration/auto-test.ts task-XXX
```

---

## Project Structure

```
kimi-swarm/
├── engine/                    # Core engine
│   ├── bin/
│   │   └── swarm-orchestrate.ts    # CLI entry point
│   ├── src/
│   │   ├── index.ts               # Orchestrator API
│   │   ├── partitioner/
│   │   │   └── index.ts          # Context partitioning logic
│   │   ├── delegator/
│   │   │   └── index.ts          # Prompt generation
│   │   ├── integration/
│   │   │   ├── auto-integrate.ts # Result integration
│   │   │   └── auto-test.ts      # Affected test runner
│   │   ├── polybot-context/
│   │   │   ├── build-map.ts      # Project indexer
│   │   │   └── map.json          # Indexed project map
│   │   ├── types/
│   │   │   └── index.ts          # Shared TypeScript types
│   │   └── utils/
│   │       ├── checkpoint.ts     # Worker checkpoint system
│   │       └── token-estimator.ts# Token estimation
│   ├── package.json
│   └── tsconfig.json
│
├── hooks/                     # Swarm hooks for Brain Stack
│   ├── swarm-session-start.sh   # Bus status on session start
│   └── swarm-stop.sh           # Stuck task detection
│
├── skills/swarm-orchestrator/ # Kimi skill files
│   ├── SKILL.md                # Main skill definition
│   ├── NEW_SESSION_INSTRUCTIONS.md  # Session startup guide
│   ├── PROMPT_INICIO_SESION.md      # Ready-to-paste prompt
│   └── CONTEXT-STRIPPING.md    # Context cleanup rules
│
└── legacy/                    # Archived bash scripts (v0.1)
```

---

## How It Works

### 1. Partitioning

The engine reads your request and the project map. It:

1. Extracts keywords from your request
2. Matches them against service names, file paths, and imports
3. Estimates total token count for matched services
4. If >120k tokens, splits into chunks grouped by service dependencies

**Example:**
```
Request: "Fix dashboard auth and balance display"
→ Matches: dashboard, polymarket-client
→ Total: ~85k tokens
→ Decision: 1 worker (fits in single context)
```

```
Request: "Complete analysis of the entire polybot project"
→ Matches: ALL 28 services
→ Total: ~368k tokens
→ Decision: 4 workers
  Worker 1: activity-tracker, allocation-manager, analytics... (103k)
  Worker 2: copy-betting, cost-tracker, dashboard... (107k)
  Worker 3: ml-scoring, optimizer, order-intelligence... (102k)
  Worker 4: position-monitor, telegram, tui... (55k)
```

### 2. Prompt Generation

For each chunk, the engine generates a complete worker brief including:
- Objective and context
- List of files to read
- Constraints and success criteria
- Checkpoint instructions
- Delivery format (result.md template)

Prompts are saved to `~/shared-context/polybot/bus/prompts/`.

### 3. Worker Execution

Workers receive the prompt and:
1. Read the specified files
2. Implement the fix/feature
3. Save checkpoints every 2-3 minutes
4. Write a structured result report

### 4. Integration

After all workers complete:
1. `auto-integrate.ts` reads all result files
2. Detects conflicts (same file modified by multiple workers)
3. Generates an integration plan with apply order
4. You apply changes using WriteFile/StrReplaceFile

### 5. Validation

`auto-test.ts`:
1. Detects which services were modified
2. Runs filtered tests: `npm test -- --run -t "<service>"`
3. Reports pass/fail

---

## Brain Stack Integration

The system includes hooks that integrate with the Brain Stack v2.4:

### Session Start Hook
- Shows bus status (pending/ready tasks)
- Detects `emergency-delegate.json` from previous session

### Stop Hook (after every turn)
- Counts work turns (file reads, edits, searches)
- Warning at 10 turns: "Consider delegating"
- Block at 15 turns: "STOP and delegate NOW"
- Resets counter on chat-only turns

### PreCompact Hook
- When context approaches 212k tokens
- Creates `emergency-delegate.json`
- Forces delegation on next turn

---

## Configuration

See `engine/src/types/index.ts` for full config:

```typescript
const DEFAULT_CONFIG = {
  maxChunkTokens: 150_000,      // Max tokens per worker
  chunkSafetyMargin: 20_000,    // Headroom per chunk
  partitionThreshold: 120_000,  // When to force partitioning
  polybotRoot: '/home/grapho/projects/polybot',
  busRoot: '/home/grapho/shared-context/polybot',
};
```

---

## Example Session

```
User: "Fix dashboard onPause bug"

You:
1. cd ~/kimi-swarm/engine && npx tsx bin/swarm-orchestrate.ts "Fix dashboard onPause bug"

Engine:
→ 1 worker, dashboard service, 41.6k tokens
→ Prompt saved to bus/prompts/task-123-single.md

You:
2. cat ~/shared-context/polybot/bus/prompts/task-123-single.md
3. Agent(subagent_type="coder", prompt="<contents>")

Worker:
→ Works for 15 min
→ Modifies 3 files
→ Writes result to bus/responses/task-123-single-result.md

You:
4. cd ~/kimi-swarm/engine && npx tsx src/integration/auto-integrate.ts
→ Integration plan generated

You:
5. Apply changes with WriteFile/StrReplaceFile

You:
6. cd ~/kimi-swarm/engine && npx tsx src/integration/auto-test.ts
→ Tests pass

You:
7. git add -A && git commit --no-verify -m "fix: ..."
```

---

## Known Limitations

1. **Worker delivery**: Sometimes workers don't write `result.md`. Mitigation: prompt includes mandatory delivery instructions. If missed, use `git diff` to capture changes.

2. **Auto-integrate doesn't auto-apply**: By design. The orchestrator must review before applying changes to prevent bad merges.

3. **Test pattern matching**: Uses `-t "<service>"` which may not match all test file naming conventions.

4. **Agent() cannot be scripted**: Only the conversational agent can call `Agent()`. The engine generates prompts but cannot launch workers automatically.

---

## Roadmap

- [ ] Hierarchical indexing for Solbot (51M tokens, 1620 files)
- [ ] Auto-apply safe changes (new files, non-conflicting edits)
- [ ] Post-merge auto-test hook
- [ ] Worker result capture fallback (git diff auto-detection)
- [ ] Service-to-test-pattern mapping

---

## License

MIT — Use at your own risk. This is a tooling experiment for AI-assisted development.
