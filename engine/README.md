# 🐝 Kimi Swarm Engine — Polybot MVP

> Context partition and auto-delegation engine for Kimi CLI multi-agent orchestration.

## Problem It Solves

Polybot has **518k tokens** of source code. Kimi CLI's context window is **262k** (compacts at ~212k). This engine automatically:

1. **Partitions** tasks into context chunks <150k tokens each
2. **Delegates** to `Agent()` workers with precisely scoped prompts
3. **Integrates** results back into the project

No manual terminal opening. No bash scripts to run. Just describe the task and launch workers.

---

## Quick Start

```bash
cd ~/kimi-swarm/engine

# 1. Regenerate the project map (when code changes)
npm run index-polybot

# 2. Orchestrate a task
npx tsx bin/swarm-orchestrate.ts "Fix the position monitor exit rules"

# 3. Copy-paste the generated prompt into Agent(subagent_type="coder")
```

---

## Architecture

```
User Request
    ↓
[Partitioner]  →  Identifies relevant services  →  Calculates tokens
    ↓
[Delegator]    →  Generates worker prompts      →  Writes to bus
    ↓
Agent(coder)   →  Executes with scoped context  →  Writes result
    ↓
[Integrator]*  →  Applies changes               →  Runs tests
```

*Integrator is the Orquestador (this CLI session).*

---

## Partitioning Strategy

### When does it partition?
- **Single worker**: ≤120k tokens of context needed
- **Multiple workers**: >120k tokens OR spans >3 unrelated services

### How does it identify relevant services?
1. Explicit service names from user (`explicitServices`)
2. Keyword matching against service names and file paths (≥2 matches required)
3. File path matching (`explicitFiles`)

### Chunk composition
- Always includes `types/` (shared contracts)
- Includes full target service code
- Includes 15% of dependency tokens (interfaces, not full implementation)
- Optionally includes `core/` if chunk is small enough

---

## Polybot Context Map

Generated from actual source code. Key stats:

| Category | Tokens | Files |
|----------|--------|-------|
| **Total source** | 518,012 | 312 |
| **Services** | 345,728 | 204 |
| **Core + Types + Tests** | 172,314 | 108 |
| **Largest service** | live-betting (33,289) | 15 files |
| **Smallest service** | telegram-bot (106) | 1 file |

### Services by size

| Service | Tokens | Files |
|---------|--------|-------|
| live-betting | 33,296 | 15 |
| ml-scoring | 31,474 | 17 |
| copy-betting | 30,938 | 11 |
| position-monitor | 27,902 | 14 |
| bettor-discovery | 24,371 | 11 |
| allocation-manager | 22,002 | 10 |
| paper-betting | 18,674 | 7 |
| portfolio-manager | 16,715 | 15 |
| activity-tracker | 15,280 | 9 |
| polymarket-client | 14,230 | 12 |

---

## Example Workflows

### Bug Fix (single worker)
```
Request: "Fix position monitor exit rules"
Result:  59k tokens, 1 worker, scope: position-monitor
```

### Refactor (2 workers)
```
Request: "Refactor copy betting pipeline to use new polymarket client"
Result:  163k tokens, 2 workers
  Worker 1: live-betting + ml-scoring + copy-betting + allocation-manager
  Worker 2: paper-betting + polymarket-client + anomaly-detector
```

### Cross-cutting feature (3+ workers)
```
Request: "Add circuit breaker to all betting services"
Result:  Would span live-betting, copy-betting, paper-betting, position-monitor
          → 3-4 workers depending on chunking
```

---

## Files

| File | Purpose |
|------|---------|
| `src/partitioner/index.ts` | Core partitioning logic |
| `src/delegator/index.ts` | Prompt generation + bus writes |
| `src/polybot-context/map.json` | Static project index (regenerate with `build-map.ts`) |
| `bin/swarm-orchestrate.ts` | One-shot CLI |

---

## Anti-Drift v2.0 (Causal Memory + Plan Graph)

The engine now includes a causal memory system to prevent context drift in long sessions.

### Modules

| Module | File | Purpose |
|--------|------|---------|
| `types` | `src/anti-drift/types.ts` | Core interfaces and constants |
| `causal-registry` | `src/anti-drift/causal-registry.ts` | Append-only JSONL record storage |
| `plan-graph` | `src/anti-drift/plan-graph.ts` | DAG for Main Plans + Side Plans |
| `checklist-manager` | `src/anti-drift/checklist-manager.ts` | Living checklists with inheritance |
| `re-reader` | `src/anti-drift/re-reader.ts` | Intelligent context re-reading |
| `rollup-generator` | `src/anti-drift/rollup-generator.ts` | Periodic summarization |

### API

```typescript
import { antiDrift } from './src/anti-drift';

// Plan graph
const graph = antiDrift.createPlanGraph();
const plan = antiDrift.createPlan(graph, { planType: 'main', title: 'Feature X', ... });
antiDrift.savePlanGraph(graph);

// Causal records
antiDrift.appendRecord({ recordId: 'rec-001', turnNumber: 1, ... });

// Context re-read
const context = antiDrift.reReadContext(currentTurn, activePlanId);
```

### Data Storage

| Data | Path |
|------|------|
| Causal records | `~/.kimi/state/causal-registry.jsonl` |
| Plan graph | `~/.kimi/state/plan-graph-index.json` |
| Checklists | `~/.kimi/state/checklists/{id}.json` |
| Rollups | `~/.kimi/state/rollups/rollup-{start}-{end}.json` |

---

## Next Steps (Roadmap)

- [x] **Anti-Drift v2.0**: Causal memory + plan graph system
- [ ] **Context stripping**: Ensure workers don't inherit full parent context
- [ ] **Auto-launch**: Call `Agent()` directly instead of copy-paste
- [ ] **Result integration**: Auto-read responses and apply changes
- [ ] **Hook integration**: Auto-partition when context approaches 200k
- [ ] **Tests**: Unit tests for partitioner with fixture tasks
- [ ] **Solbot map**: Generate equivalent map for solbot-ts

---

*Version: 0.1.0-polybot-mvp + Anti-Drift v2.0*
