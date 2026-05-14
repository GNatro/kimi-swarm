# Context Stripping Guide for Swarm Orchestrator

> CRITICAL: Read this BEFORE delegating to workers. Your context size directly impacts worker performance.

## The Problem

Kimi CLI's `Agent()` tool inherits the FULL conversation context from the parent (you, the orchestrator).

| Your Context | Worker Inherits | Worker Has Left |
|-------------|-----------------|-----------------|
| 20k tokens | 20k tokens | ~240k tokens ✅ |
| 50k tokens | 50k tokens | ~210k tokens ✅ |
| 80k tokens | 80k tokens | ~180k tokens ⚠️ |
| 120k tokens | 120k tokens | ~140k tokens ❌ |
| 150k tokens | 150k tokens | ~110k tokens ❌ |

**Rule: Never delegate when your context exceeds 60k tokens.**

## How to Keep Context Small

### 1. Be Concise in Conversation
- BAD: 5 paragraphs analyzing the problem
- GOOD: 1 paragraph + delegate to explore worker

### 2. Offload Analysis to Workers
Instead of:
```
You: "Let me search for the bug... [10 tool calls]... Ah, I found it in line 234..."
You: "Now let me fix it..."
```

Do:
```
You: "Worker, find and fix the circuit breaker bug."
Worker: [does 10 tool calls] + fix
```

### 3. Use Shell for One-Off Queries
Instead of reading files directly (which adds to context):
```bash
# Check if file exists, get line count, etc.
grep -n "pattern" file.ts | head -5
```

### 4. Reset Context Strategically
If context grows too large:
1. Save state to filesystem
2. Start a fresh reasoning chain
3. Reference saved state instead of repeating it

### 5. The "Delegate Early" Pattern
```
Turn 1: User asks for feature X
Turn 2: You analyze scope with engine (3-4 tool calls)
Turn 3: You DELEGATE immediately (context ~15k)
Turn 4+: Worker does the work
```

## Pre-Delegation Checklist

Before calling `Agent()`, verify:
- [ ] My context is < 60k tokens (estimate: chars / 4)
- [ ] I haven't done extensive analysis in this turn
- [ ] The worker prompt includes all necessary context
- [ ] I've set up filesystem bridge for results

## Emergency: Context Too Large

If you MUST delegate but context is large:
1. Strip unnecessary conversation history mentally
2. Focus the worker prompt on ESSENTIAL files only
3. Use `explore` subagent for broad searches (they need less precise context)
4. Split into smaller subtasks

## Measuring Your Context

Approximation:
```
Your context ≈ (total chars in conversation) / 4
```

There's no direct API to check token count. Use heuristics:
- 10 short turns: ~10-20k tokens
- 5 turns with file reads: ~30-50k tokens
- 10+ turns with analysis: >60k tokens

## Worker Budget Reference

| Task Type | Worker Needs | Your Max Context |
|-----------|-------------|------------------|
| Simple bug fix (3-5 files) | ~30k tokens | 120k |
| Feature implementation (10 files) | ~60k tokens | 80k |
| Refactor (20+ files) | ~100k tokens | 40k |
| Cross-service change | ~120k tokens | 20k |

**When in doubt: delegate earlier, delegate smaller.**
