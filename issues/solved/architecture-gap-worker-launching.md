# Architecture Gap: Worker Launching Mechanism

## Critical Discovery - November 9, 2025 7:58 AM

**Root Cause:** Workers are being created as spec files but the autonomous launching mechanism is **completely disconnected** from Claude Code.

## Intended vs Actual Architecture

### INTENDED Flow (Per Documentation)

```
Master Agent
  → Calls spawn-worker.sh
  → Creates worker spec JSON in active/
  → Worker daemon detects pending worker
  → Worker daemon launches Claude Code session
  → Claude Code reads worker spec
  → Claude Code executes task with AI
  → Worker completes and reports results
```

### ACTUAL Implementation (Broken)

```
Master Agent
  → Calls spawn-worker.sh
  → Creates worker spec JSON in active/
  → Worker daemon detects pending worker
  → Worker daemon tries to find autonomous-worker.sh (DOESN'T EXIST - it's .disabled)
  → Worker daemon falls back to type-specific scripts
  → Shell scripts run WITHOUT Claude Code
  → NO AI EXECUTION HAPPENS
  → Workers sit idle or fail immediately
```

## Evidence

### 1. Autonomous Worker Script is Disabled

**File:** `agents/workers/autonomous-worker.sh.disabled`

This script:
- Is supposed to read worker specs and execute tasks
- Has logic to update task statuses
- Can only handle simple test tasks
- **Is disabled** (renamed with .disabled extension)

**Worker daemon checks for it:**
```bash
# Line 173 in worker-daemon.sh
AUTONOMOUS_SCRIPT="$COMMIT_RELAY_HOME/agents/workers/autonomous-worker.sh"

if [ -f "$AUTONOMOUS_SCRIPT" ]; then
    # This check FAILS because file is .disabled
```

### 2. Type-Specific Scripts Don't Launch Claude Code

**Files:**
- `agents/workers/implementation-worker.sh`
- `agents/workers/test-worker.sh`
- `agents/workers/documentation-worker.sh`
etc.

These scripts:
- Are shell scripts, not Claude Code launchers
- Don't invoke `claude` command
- Don't send prompts to Claude Code
- Can't execute AI tasks

**Worker daemon tries to use them:**
```bash
# Line 189 in worker-daemon.sh
elif [ -f "$WORKER_SCRIPT" ]; then
    # Use worker-type-specific shell script
    log_daemon "INFO: Using type-specific worker: $WORKER_SCRIPT"

    # Build worker command with environment variables
    TERMINAL_CMD="cd $COMMIT_RELAY_HOME && export WORKER_ID='$WORKER_ID' && ... && $WORKER_SCRIPT"
```

But these scripts don't actually invoke Claude Code!

### 3. spawn-worker.sh Expects Manual Intervention

**End of spawn-worker.sh:**
```bash
# Display next steps
print_info "Next Steps:"
echo "1. Start Claude Code session with worker prompt:"
echo "   claude-code --prompt-file agents/prompts/workers/${WORKER_TYPE}.md"
echo ""
echo "2. Worker will read its specification from:"
echo "   $WORKER_SPEC_FILE"
```

This indicates the script was designed for **MANUAL** worker launching, not autonomous!

## The Missing Link

### What's Missing: Claude Code Launcher

The worker-daemon needs to:

1. **Find pending worker spec**
2. **Launch Claude Code session** with:
   - The worker prompt template (`agents/prompts/workers/${WORKER_TYPE}.md`)
   - The worker spec file path as context
   - Initial prompt that tells Claude to read the spec and execute

3. **Claude Code should:**
   - Read the worker spec JSON
   - Parse task data
   - Execute the task using AI tools
   - Update coordination files
   - Mark task as complete

### Current Gap

**Missing:** The bridge between worker-daemon and Claude Code.

**What exists:**
- ✅ Worker spec creation (spawn-worker.sh)
- ✅ Worker detection (worker-daemon.sh)
- ✅ Worker prompt templates (agents/prompts/workers/*.md)
- ❌ **Claude Code launcher** (doesn't exist)
- ❌ **Prompt injection mechanism** (no way to send spec to Claude)

## Architecture Misalignment

### Documentation Says:

From `README.md` (lines 594-618):
```
WORKER TYPES:
    scan-worker          Security scanning (8k tokens, 15min)
    fix-worker           Apply fixes (5k tokens, 20min)
    ...
```

From `docs/WORKER-LIFECYCLE.md`:
```
Workers in the commit-relay system have a well-defined lifecycle
from creation to archival.

1. Pending -> 2. Running -> 3. Completed/Failed
```

**Implication:** Workers should autonomously execute AI tasks.

### Reality:

- Workers get stuck in "pending" forever
- No mechanism to transition pending → running
- No Claude Code invocation
- No AI execution

## Historical Context

Looking at the disabled autonomous-worker.sh script (line 194-204):

```bash
else
    echo "ERROR: This is not a simple test task"
    echo "ERROR: Autonomous worker shell script cannot handle complex tasks"
    echo "ERROR: This worker should have been launched with Claude Code interactive session"
```

**This reveals:**
1. The autonomous-worker.sh was a **temporary test solution**
2. It could only handle hardcoded test patterns
3. It was **never intended for production**
4. It was supposed to be replaced with Claude Code integration
5. **The replacement was never implemented**

## What Needs to Be Built

### Option 1: Re-enable and Enhance Autonomous Worker

**Pros:**
- Shell-based, no external dependencies
- Fast execution for simple tasks
- Can handle test/validation tasks

**Cons:**
- No AI capabilities
- Can't handle complex tasks
- Requires pattern matching for every task type
- Limited to predefined operations

**Verdict:** ❌ Not suitable for commit-relay's vision

### Option 2: Build Claude Code Launcher (Recommended)

**Architecture:**
```bash
# New file: agents/workers/claude-worker-launcher.sh

#!/bin/bash
# Launch worker in Claude Code session

WORKER_ID="$1"
SPEC_FILE="coordination/worker-specs/active/${WORKER_ID}.json"

# Read worker spec
WORKER_TYPE=$(jq -r '.worker_type' "$SPEC_FILE")
PROMPT_TEMPLATE="agents/prompts/workers/${WORKER_TYPE}.md"
TASK_DATA=$(jq -r '.task_data' "$SPEC_FILE")

# Construct initial prompt that includes:
# 1. Worker prompt template content
# 2. Worker spec file path
# 3. Instruction to read spec and execute task

INITIAL_PROMPT="$(cat $PROMPT_TEMPLATE)

WORKER SPECIFICATION:
Read your complete task specification from: $SPEC_FILE

TASK DATA:
$TASK_DATA

Please read the spec file, understand the task, and execute it autonomously."

# Launch Claude Code with prompt
claude --prompt "$INITIAL_PROMPT"
```

**Worker daemon integration:**
```bash
# In worker-daemon.sh, replace shell script logic with:

CLAUDE_LAUNCHER="$COMMIT_RELAY_HOME/agents/workers/claude-worker-launcher.sh"

if [ -f "$CLAUDE_LAUNCHER" ]; then
    log_daemon "INFO: Launching worker with Claude Code"

    # Launch in Terminal tab
    osascript -e "tell application \"Terminal\"
        do script \"cd $COMMIT_RELAY_HOME && $CLAUDE_LAUNCHER $WORKER_ID\"
        activate
    end tell" > /dev/null 2>&1 &
else
    log_daemon "ERROR: Claude worker launcher not found"
fi
```

**Pros:**
- Uses actual AI for task execution
- Handles complex tasks
- Leverages Claude Code's full capabilities
- Aligns with architecture documentation

**Cons:**
- Requires claude command to accept prompts programmatically
- May need different approach for prompt injection

### Option 3: Worker Prompt Templates with Spec Context

**Better approach:**

Worker prompt templates should include instructions to:
1. Look for worker spec at specific path
2. Read spec file using Read tool
3. Parse task data
4. Execute task
5. Update coordination files

**Implementation:**

Update `agents/prompts/workers/implementation-worker.md`:
```markdown
# Implementation Worker

You are an implementation worker in the commit-relay system.

## INITIALIZATION

1. Your worker ID and spec file should be provided via environment variables:
   - WORKER_ID: Your unique identifier
   - SPEC_FILE: Path to your worker specification JSON

2. IMMEDIATELY upon starting:
   - Use the Read tool to read $SPEC_FILE
   - Parse the task_data field
   - Understand your specific assignment

3. Execute the task described in the spec
4. Update coordination files as you progress
5. Mark task as complete when finished

## YOUR TASK

[Read and execute the task from your worker spec file]

Let me read my specification now...
```

Then worker-daemon launches:
```bash
claude --env WORKER_ID=$WORKER_ID --env SPEC_FILE=$SPEC_FILE \
      --prompt-file agents/prompts/workers/${WORKER_TYPE}.md
```

## Recommended Solution

**Implement Option 3** with environment variable injection:

1. Update all worker prompt templates to read spec files
2. Modify worker-daemon to use `claude` command with environment variables
3. Test with single worker before deploying
4. Ensure Claude Code can access environment variables

**Fallback:** If Claude Code doesn't support env vars in CLI:
- Use a wrapper script that reads spec and injects into prompt
- Or modify spec files to be .md instead of .json so Claude reads them as context

## Success Criteria

After fix, verify:
1. ✅ Worker daemon spawns Claude Code processes
2. ✅ Claude Code sessions receive worker specs
3. ✅ Workers appear in `~/.claude/history.jsonl` with actual messages
4. ✅ Workers create branches and make commits
5. ✅ Workers update task statuses
6. ✅ Workers complete tasks within expected timeframes

## Current State

- ❌ Workers spawned but idle (0 conversation history)
- ❌ No Claude Code integration
- ❌ Shell scripts don't invoke AI
- ❌ Autonomous worker disabled
- ❌ System not actually autonomous

**Status:** Architecture gap prevents any worker execution. System cannot function as designed until this is fixed.

---

Last updated: 2025-11-09 07:58 AM CST
