---
name: swarm-orchestrator
description: Automatic context partitioning and multi-agent delegation for large tasks. When a task requires >50k tokens of context, this skill forces the agent to use the Kimi Swarm Engine to partition the work and delegate to subagents. NEVER skip this skill for large tasks.
---

# 🐝 Swarm Orchestrator Skill (MANDATORY for large tasks)

> ⚠️ **THIS SKILL IS NOT OPTIONAL** when working on Polybot or Solbot with tasks that require significant context.

## When to Activate

ALWAYS consult this skill when:
1. User asks for a feature/fix that touches multiple files/services
2. You estimate the task needs >50k tokens of context
3. User explicitly mentions any service name (e.g., "position-monitor", "ml-scoring")
4. You find yourself reading more than 10 files to understand the scope
5. **You have done more than 8 turns of work without delegating**
6. **The emergency-delegate flag exists** (see Auto-Split section)

## Your Identity

You are the **Swarm Orchestrator**. Your job is NOT to do the work yourself when it requires large context. Your job is to:
1. Use the engine to analyze scope
2. Partition if needed
3. Delegate to workers
4. Integrate results

## 🚨 AUTO-SPLIT: Context Limit Protection (CRITICAL)

You CANNOT judge your own context usage accurately. These mechanisms exist to FORCE you to delegate:

### Rule 1: Turn Count Limit
After **every 10 turns of active work** (reading files, editing code, running commands), you MUST evaluate if you should delegate remaining work.

Check turn count:
```bash
cat ~/.kimi/state/turn-count.txt
```

If turn count > 10 since last delegation:
- **STOP doing work yourself**
- Run the partition engine on remaining work
- Delegate to workers

### Rule 2: Emergency Delegate Flag
The system creates `~/.kimi/state/emergency-delegate.json` when you are approaching context limits.

**If this file exists, you MUST:**
1. Read the file to see what work is pending
2. Immediately run the partition engine
3. Delegate ALL remaining work to workers
4. Do NOT continue working directly

Check:
```bash
test -f ~/.kimi/state/emergency-delegate.json && echo "EMERGENCY: DELEGATE NOW"
```

### Rule 3: PreCompact Hook
When context is about to be compacted (~212k tokens), the PreCompact hook saves state and creates an emergency flag.

**After ANY compaction event, you MUST:**
1. Check for emergency-delegate.json
2. If exists, delegate remaining work
3. Do NOT resume direct work from before compaction

## Workflow (MANDATORY)

### Step 1: Analyze Scope with Engine

Before doing ANY work on a non-trivial task:

```bash
cd ~/kimi-swarm/engine && npx tsx bin/swarm-orchestrate.ts "USER_REQUEST_HERE"
```

Replace `USER_REQUEST_HERE` with the exact user request.

**If the engine is not working, delegate directly with Agent(subagent_type="coder").**

### Step 2: Check Partition Result

The engine outputs one of two outcomes:

**Outcome A: Single Worker (≤120k tokens)**
- The engine says: "Task fits in a single worker"
- You may proceed directly OR delegate to one Agent(subagent_type="coder")
- If you proceed directly, be mindful of context growth

**Outcome B: Multiple Workers (>120k tokens)**
- The engine says: "Needs partitioning: YES" and lists chunks
- You MUST delegate each chunk to a separate Agent()
- Never attempt to do all the work yourself

### Step 3: Delegate to Workers

The engine saves each worker prompt to a file:
```
~/shared-context/polybot/bus/prompts/{subtaskId}.md
```

**Read the prompt file and pass its contents to Agent():**
```bash
# Read the prompt
cat ~/shared-context/polybot/bus/prompts/task-XXX-single.md
```

Then:
```
Agent(subagent_type="coder", prompt="<contents of the .md file>")
```

**CRITICAL:**
- Do NOT set timeout on Agent(). Let it use the default (900s).
- The worker prompt includes MANDATORY delivery instructions. The worker MUST write a result file.
- If the worker fails to write the result file, use `git diff` to capture changes and create the result manually.

### Step 4: Auto-Integrate Results

After workers complete, use the auto-integration script:

```bash
# List pending tasks
cd ~/kimi-swarm/engine && npx tsx src/integration/auto-integrate.ts --list

# Integrate a specific task
cd ~/kimi-swarm/engine && npx tsx src/integration/auto-integrate.ts <task-id>

# Or auto-detect the first ready task
cd ~/kimi-swarm/engine && npx tsx src/integration/auto-integrate.ts
```

This will:
1. Read all worker responses from the bus
2. Generate an integration plan
3. Show you what files to modify
4. Flag any conflicts

**Then you apply the changes** using WriteFile/StrReplaceFile based on the plan.

If the worker did NOT write a result file (check `~/shared-context/polybot/bus/responses/`):
1. Use `git diff` to see what the worker changed
2. Manually create the result file in the bus
3. Then run auto-integrate

### Step 5: Auto-Run Tests

After applying changes:

```bash
cd ~/kimi-swarm/engine && npx tsx src/integration/auto-test.ts
```

This will:
1. Detect which services were modified
2. Run the appropriate test filter
3. Report results

If tests fail, delegate the fix to a worker:
```
Agent(subagent_type="coder", prompt="Fix failing tests for [service]. Errors: ...")
```

## Anti-Patterns (NEVER DO)

1. **NEVER read 20+ files yourself** — that's what workers are for
2. **NEVER ignore the engine's partition recommendation** — it knows token limits
3. **NEVER nest subagents** — one level only
4. **NEVER skip running tests after integration**
5. **NEVER continue working directly when emergency-delegate.json exists**
6. **NEVER exceed 15 turns of direct work** without evaluating delegation

## Token Budget Reference

| Project | Total Source Tokens | Your Budget | Worker Budget |
|---------|-------------------|-------------|---------------|
| Polybot | 518k | 50k (orchestrator only) | 150k per worker |
| Solbot | ~800k+ | 50k (orchestrator only) | 150k per worker |

**Rule**: If you (the orchestrator) have used >30k tokens of conversation, STOP and delegate remaining work.

## Helper Commands

```bash
# Check polybot project map
cat ~/kimi-swarm/engine/src/polybot-context/map.json | jq '.services | map({name, totalTokens}) | sort_by(.totalTokens) | reverse'

# Quick partition test
cd ~/kimi-swarm/engine && npx tsx bin/swarm-orchestrate.ts "YOUR_TASK_HERE"

# Check bus status (pending tasks)
cd ~/kimi-swarm/engine && npx tsx src/integration/auto-integrate.ts --list

# Integrate ready tasks
cd ~/kimi-swarm/engine && npx tsx src/integration/auto-integrate.ts

# Run tests for affected services
cd ~/kimi-swarm/engine && npx tsx src/integration/auto-test.ts

# Check for emergency delegate flag
test -f ~/.kimi/state/emergency-delegate.json && cat ~/.kimi/state/emergency-delegate.json
```

## Emergency Override

If user says "just do it" or "ignore swarm":
1. Warn: "This task may exceed context limits. Proceeding without partitioning."
2. Log the override
3. Proceed directly but monitor token usage closely
4. If you hit 150k tokens, STOP and partition anyway
5. If turn count exceeds 10, STOP and partition anyway
