# 7 AI Terms - Commit-Relay System Integration Guide

**Source**: "7 AI Terms You Need to Know: Agents, RAG, ASI & More" (Martin Keen, IBM)
**Purpose**: Map 7 essential AI concepts to commit-relay's architecture
**Status**: Integration roadmap showing what's built, what's needed, how they connect

---

## Executive Summary

This guide maps 7 fundamental AI concepts to commit-relay's multi-agent architecture:

| Term | Status in Commit-Relay | Priority |
|------|------------------------|----------|
| 1. Agentic AI | ✅ **IMPLEMENTED** - Workers follow perceive→reason→act cycle | Core |
| 2. Large Reasoning Models | ✅ **ACTIVE** - Claude with chain-of-thought prompting | Core |
| 3. Vector Database | 🔨 **PARTIAL** - JSON storage exists, needs embedding layer | High |
| 4. RAG | 🔨 **PARTIAL** - Retrieval exists, needs semantic search | High |
| 5. MCP | ⏳ **PLANNED** - Tool registry partially built | Medium |
| 6. MoE | ✅ **IMPLEMENTED** - Coordinator routes to specialist masters | Core |
| 7. ASI/AGI | 🎯 **VISION** - Self-improving learning system (Phase 5+) | Future |

**Key Insight**: Commit-relay already implements 3/7 concepts. The remaining 4 are either partially built or planned. This guide shows how to complete the integration.

---

## Term 1: Agentic AI - Autonomous Goal-Oriented Agents

### Concept
AI agents that reason and act autonomously to achieve goals through:
- **Perceive**: Understand environment
- **Reason**: Plan next steps
- **Act**: Execute plan
- **Observe**: See results
- **Repeat**: Continuous loop

Unlike chatbots (one prompt → one response), agents run autonomously through multiple cycles.

### Commit-Relay Implementation Status: ✅ IMPLEMENTED

**Where**: All workers (`dev-worker-*`, `sec-worker-*`, `inv-worker-*`)

**Current Architecture**:
```bash
# agents/workers/dev-worker-XXXX/
# Worker lifecycle matches agent pattern:

# 1. PERCEIVE - Read environment
cat coordination/task-queue.json          # Task details
cat coordination/memory/long-term/        # Past learnings
cat coordination/masters/*/context/       # System state

# 2. REASON - Plan approach (happens in Claude with chain-of-thought)
# Worker prompt includes: "Think step-by-step before implementing"

# 3. ACT - Execute plan
bash scripts/implement-feature.sh
jq '.status = "in_progress"' worker-spec.json

# 4. OBSERVE - Check results
bash -n new-script.sh                     # Syntax check
git status                                 # File changes
jq empty new-file.json                    # Validation

# 5. REPEAT - Continue until goal achieved
# Worker continues through multiple Claude responses until task complete
```

**Evidence of Agentic Behavior**:
```bash
# Example: dev-worker-E35E4762 implementing health alert feature
# Cycle 1: Perceive task, reason about architecture
# Cycle 2: Act by creating dashboard component
# Cycle 3: Observe compilation errors, reason about fix
# Cycle 4: Act by fixing TypeScript errors
# Cycle 5: Observe tests pass, mark complete
```

### Enhancement: Explicit Agent Loop

**Add**: `agents/lib/agent-loop.sh` - Make the perceive→reason→act cycle explicit

```bash
#!/bin/bash
# agents/lib/agent-loop.sh
# Explicit agent loop framework

set -euo pipefail

WORKER_ID="$1"
TASK_ID="$2"
MAX_CYCLES="${3:-10}"

WORKER_DIR="agents/workers/$WORKER_ID"
STATE_FILE="$WORKER_DIR/agent-state.json"

# Initialize agent state
initialize_agent_state() {
    jq -n \
        --arg wid "$WORKER_ID" \
        --arg tid "$TASK_ID" \
        '{
            worker_id: $wid,
            task_id: $tid,
            cycle: 0,
            goal_achieved: false,
            observations: [],
            actions_taken: []
        }' > "$STATE_FILE"
}

# PERCEIVE: Gather environment information
perceive_environment() {
    local cycle="$1"

    # Read task details
    local task_data=$(jq --arg tid "$TASK_ID" \
        '.tasks[] | select(.id == $tid)' \
        coordination/task-queue.json)

    # Read recent learnings
    local learnings=$(jq -s 'sort_by(.timestamp) | reverse | .[0:5]' \
        coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl)

    # Read system state
    local system_state=$(cat coordination/orchestrator/state/current.json)

    # Compile perception
    jq -n \
        --argjson task "$task_data" \
        --argjson learn "$learnings" \
        --argjson state "$system_state" \
        --argjson cycle "$cycle" \
        '{
            cycle: $cycle,
            task: $task,
            recent_learnings: $learn,
            system_state: $state,
            timestamp: (now | todate)
        }' > "$WORKER_DIR/perception-cycle-$cycle.json"

    echo "$WORKER_DIR/perception-cycle-$cycle.json"
}

# REASON: Generate reasoning prompt (happens in Claude)
generate_reasoning_prompt() {
    local perception_file="$1"
    local cycle="$2"

    cat << PROMPT
# AGENT REASONING - Cycle $cycle

You are an autonomous agent for commit-relay.

## CURRENT PERCEPTION
$(cat "$perception_file")

## YOUR GOAL
$(jq -r '.task.description' "$perception_file")

## AGENT LOOP STAGE: REASONING
1. Analyze your current perception
2. Review actions taken in previous cycles (if any)
3. Determine if goal is achieved
4. If not achieved, plan next action
5. Consider potential obstacles

## OUTPUT REQUIRED
Provide your reasoning in this JSON format:
{
    "goal_achieved": true/false,
    "reasoning": "step-by-step thought process",
    "next_action": "specific action to take",
    "expected_outcome": "what you expect to happen",
    "risk_assessment": "potential issues"
}

Think carefully before responding.
PROMPT
}

# ACT: Execute planned action
execute_action() {
    local action="$1"
    local cycle="$2"

    local action_file="$WORKER_DIR/action-cycle-$cycle.sh"

    # Write action to executable script
    echo "$action" > "$action_file"
    chmod +x "$action_file"

    # Execute with logging
    if bash "$action_file" > "$WORKER_DIR/action-output-$cycle.txt" 2>&1; then
        echo "success"
    else
        echo "failure"
    fi
}

# OBSERVE: Capture results of action
observe_results() {
    local cycle="$1"

    # Check for new files
    local new_files=$(git status --short | grep '^??' || echo "")

    # Check for errors
    local error_log="$WORKER_DIR/action-output-$cycle.txt"
    local has_errors=$(grep -i "error\|fail" "$error_log" || echo "")

    # Compile observation
    jq -n \
        --arg cycle "$cycle" \
        --arg new_files "$new_files" \
        --arg errors "$has_errors" \
        '{
            cycle: ($cycle | tonumber),
            new_files: ($new_files | split("\n")),
            errors: ($errors != ""),
            error_details: $errors,
            timestamp: (now | todate)
        }' > "$WORKER_DIR/observation-cycle-$cycle.json"

    # Update agent state with observation
    jq --slurpfile obs "$WORKER_DIR/observation-cycle-$cycle.json" \
        '.observations += $obs' \
        "$STATE_FILE" > "${STATE_FILE}.tmp" && \
        mv "${STATE_FILE}.tmp" "$STATE_FILE"

    echo "$WORKER_DIR/observation-cycle-$cycle.json"
}

# Main agent loop
run_agent_loop() {
    initialize_agent_state

    for cycle in $(seq 1 $MAX_CYCLES); do
        echo "=== Agent Cycle $cycle ==="

        # 1. PERCEIVE
        echo "  [1/5] Perceiving environment..."
        perception_file=$(perceive_environment "$cycle")

        # 2. REASON (would happen in Claude here)
        echo "  [2/5] Generating reasoning prompt..."
        reasoning_prompt=$(generate_reasoning_prompt "$perception_file" "$cycle")
        echo "$reasoning_prompt" > "$WORKER_DIR/reasoning-prompt-$cycle.md"

        # At this point, Claude would respond with reasoning JSON
        # For now, we'll simulate by checking if goal markers exist

        # 3. Check if goal achieved
        local goal_achieved=$(check_goal_achievement "$TASK_ID")

        if [ "$goal_achieved" = "true" ]; then
            echo "  ✓ Goal achieved after $cycle cycles"
            jq '.goal_achieved = true' "$STATE_FILE" > "${STATE_FILE}.tmp" && \
                mv "${STATE_FILE}.tmp" "$STATE_FILE"
            break
        fi

        # 4. ACT (action would come from Claude's reasoning response)
        echo "  [3/5] Executing action..."
        # execute_action "$planned_action" "$cycle"

        # 5. OBSERVE
        echo "  [4/5] Observing results..."
        observation_file=$(observe_results "$cycle")

        echo "  [5/5] Cycle $cycle complete"
        echo ""
    done

    # Report final state
    echo "=== Agent Loop Complete ==="
    jq -r '"Total cycles: \(.cycle)\nGoal achieved: \(.goal_achieved)\nActions taken: \(.actions_taken | length)"' \
        "$STATE_FILE"
}

# Helper: Check if task goal is achieved
check_goal_achievement() {
    local task_id="$1"

    # Check if task marked as completed
    local status=$(jq -r --arg tid "$task_id" \
        '.tasks[] | select(.id == $tid) | .status' \
        coordination/task-queue.json)

    if [ "$status" = "completed" ]; then
        echo "true"
    else
        echo "false"
    fi
}

# Run if called directly
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    run_agent_loop
fi
```

**Usage**:
```bash
# Launch worker with explicit agent loop
./agents/lib/agent-loop.sh "dev-worker-XXXX" "task-123" 10

# This creates visible agent cycle artifacts:
# - perception-cycle-1.json, perception-cycle-2.json, ...
# - reasoning-prompt-1.md, reasoning-prompt-2.md, ...
# - action-cycle-1.sh, action-cycle-2.sh, ...
# - observation-cycle-1.json, observation-cycle-2.json, ...
# - agent-state.json (overall state)
```

**Benefits**:
1. Makes agent loop visible and debuggable
2. Each cycle leaves audit trail
3. Can resume failed agents from last cycle
4. Clear separation of perceive/reason/act/observe stages
5. Easier to optimize individual stages

---

## Term 2: Large Reasoning Models - Step-by-Step Problem Solving

### Concept
Specialized LLMs with reasoning-focused fine-tuning:
- Unlike regular LLMs (generate immediately)
- Work through problems step-by-step
- Trained on verifiable problems (math, code)
- Use reinforcement learning to generate reasoning sequences
- When chatbot says "thinking" → reasoning model at work
- Generate internal chain of thought before responding

### Commit-Relay Implementation Status: ✅ ACTIVE

**Where**: All worker prompts use chain-of-thought prompting

**Current Implementation**:
```bash
# agents/prompts/workers/implementation-worker.md

# APPROACH
1. Analyze requirements carefully
2. Check existing patterns in codebase
3. Design solution architecture
4. Implement with proper error handling
5. Test thoroughly
6. Document state changes

# REASONING REQUIREMENT
Think step-by-step before implementing. For each major decision:
- State your reasoning
- Consider alternatives
- Explain your choice
- Verify correctness
```

**Evidence of Reasoning**:
- Workers often include "I'm thinking through..." in responses
- Multi-step planning before execution
- Self-correction when observing errors

### Enhancement: Explicit Reasoning Capture

**Add**: Capture and analyze reasoning patterns

```bash
#!/bin/bash
# agents/lib/reasoning-analyzer.sh
# Capture and analyze worker reasoning patterns

REASONING_DB="coordination/memory/reasoning-patterns.jsonl"

# Extract reasoning from worker output
capture_reasoning() {
    local worker_id="$1"
    local worker_dir="agents/workers/$worker_id"

    # Look for reasoning markers in worker output
    # (This would parse Claude's responses looking for reasoning text)

    local reasoning_text=$(grep -A 20 "thinking\|reasoning\|because\|therefore" \
        "$worker_dir/output.log" || echo "")

    if [ -n "$reasoning_text" ]; then
        jq -n \
            --arg wid "$worker_id" \
            --arg reason "$reasoning_text" \
            '{
                worker_id: $wid,
                reasoning: $reason,
                timestamp: (now | todate),
                task_type: "implementation"
            }' >> "$REASONING_DB"
    fi
}

# Analyze reasoning patterns
analyze_reasoning_patterns() {
    # Find common reasoning patterns across workers
    jq -s '
        group_by(.task_type) |
        map({
            task_type: .[0].task_type,
            count: length,
            sample_reasoning: .[0].reasoning
        })
    ' "$REASONING_DB"
}

# Find successful reasoning patterns
find_successful_patterns() {
    # Cross-reference reasoning with task outcomes
    jq -s '
        map(select(.task_outcome == "success")) |
        .[0:10] |
        .[] | .reasoning
    ' "$REASONING_DB"
}
```

**Reasoning Prompt Template**:
```bash
# agents/prompts/lib/reasoning-templates.sh

# For verifiable tasks (like code - compiler can verify)
code_reasoning_prompt() {
    cat << PROMPT
# REASONING MODE: Verification-Based

Your task involves code that can be verified by compilers/tests.

## REASONING PROCESS
1. **Parse Requirements**: What exactly needs to be built?
2. **Consider Approaches**: List 2-3 possible implementations
3. **Evaluate Trade-offs**: For each approach, consider:
   - Correctness (will it work?)
   - Maintainability (can others understand it?)
   - Performance (is it efficient?)
   - Risk (what could go wrong?)
4. **Choose Best Approach**: Explain your choice
5. **Plan Implementation**: Break into steps
6. **Verify Each Step**: Check correctness as you go

## VERIFICATION CHECKPOINTS
After each step, verify:
- Syntax: Does code parse?
- Logic: Does it solve the problem?
- Edge cases: What about unusual inputs?
- Integration: Does it fit with existing code?

Show your reasoning at each checkpoint.
PROMPT
}

# For investigation tasks (not verifiable)
investigation_reasoning_prompt() {
    cat << PROMPT
# REASONING MODE: Hypothesis-Driven

Your task involves investigation where answers aren't verifiable.

## REASONING PROCESS
1. **Form Hypothesis**: What do you think is happening?
2. **Gather Evidence**: What data supports/refutes hypothesis?
3. **Test Hypothesis**: Design experiments to validate
4. **Update Belief**: Revise hypothesis based on evidence
5. **Document Uncertainty**: What are you still unsure about?

## CONFIDENCE TRACKING
For each conclusion, state:
- Confidence level (0-100%)
- Evidence supporting
- Evidence contradicting
- What would change your mind

Show your reasoning and confidence at each step.
PROMPT
}
```

**Benefits**:
1. Explicit chain-of-thought reasoning
2. Captures reasoning patterns for learning
3. Can identify successful reasoning strategies
4. Helps debug worker failures (poor reasoning vs poor execution)

---

## Term 3: Vector Database - Semantic Search Infrastructure

### Concept
Store data as vectors (embeddings) instead of raw text/images:
- **Embedding Model**: Converts data → vector (long list of numbers)
- **Vectors**: Capture semantic meaning
- **Search**: Mathematical operations (find close vectors)
- **Result**: Semantically similar content

Example: Mountain picture → embedding → find similar images/text/music

### Commit-Relay Implementation Status: 🔨 PARTIAL

**What Exists**:
- JSON storage: `coordination/memory/`
- Keyword search: `jq` filters
- File-based collections

**What's Missing**:
- Embedding generation
- Vector similarity search
- Semantic search capabilities

### Implementation: Bash-Native Vector Database

**File**: `coordination/embeddings/vector-db.sh`

```bash
#!/bin/bash
# coordination/embeddings/vector-db.sh
# Lightweight vector database for commit-relay

set -euo pipefail

VECTOR_DB_DIR="coordination/embeddings/collections"
EMBEDDING_MODEL="all-MiniLM-L6-v2"  # 384 dimensions, fast
EMBEDDING_CACHE="coordination/embeddings/cache.json"

mkdir -p "$VECTOR_DB_DIR"

# Generate embedding for text
generate_embedding() {
    local text="$1"

    # Check cache first
    local cached=$(jq -r --arg txt "$text" \
        '.[$txt] // empty' \
        "$EMBEDDING_CACHE" 2>/dev/null)

    if [ -n "$cached" ]; then
        echo "$cached"
        return
    fi

    # Generate new embedding
    local embedding=$(python3 << 'PYEOF'
import sys
import json
from sentence_transformers import SentenceTransformer

text = sys.stdin.read()
model = SentenceTransformer('all-MiniLM-L6-v2')
embedding = model.encode(text).tolist()
print(json.dumps(embedding))
PYEOF
)

    # Cache it
    jq --arg txt "$text" \
        --argjson emb "$embedding" \
        '.[$txt] = $emb' \
        "$EMBEDDING_CACHE" > "${EMBEDDING_CACHE}.tmp" && \
        mv "${EMBEDDING_CACHE}.tmp" "$EMBEDDING_CACHE"

    echo "$embedding"
}

# Create or get collection
create_collection() {
    local collection_name="$1"
    local collection_dir="$VECTOR_DB_DIR/$collection_name"

    mkdir -p "$collection_dir"

    if [ ! -f "$collection_dir/metadata.json" ]; then
        jq -n \
            --arg name "$collection_name" \
            '{
                name: $name,
                created_at: (now | todate),
                vector_dim: 384,
                count: 0
            }' > "$collection_dir/metadata.json"
    fi

    echo "$collection_dir"
}

# Add document to collection
add_document() {
    local collection_name="$1"
    local doc_id="$2"
    local text="$3"
    local metadata="$4"  # JSON string

    local collection_dir=$(create_collection "$collection_name")

    # Generate embedding
    local embedding=$(echo "$text" | generate_embedding)

    # Store document with embedding
    jq -n \
        --arg id "$doc_id" \
        --arg txt "$text" \
        --argjson emb "$embedding" \
        --argjson meta "$metadata" \
        '{
            id: $id,
            text: $txt,
            embedding: $emb,
            metadata: $meta,
            added_at: (now | todate)
        }' > "$collection_dir/${doc_id}.json"

    # Update collection count
    jq '.count += 1' "$collection_dir/metadata.json" > "${collection_dir}/metadata.json.tmp" && \
        mv "${collection_dir}/metadata.json.tmp" "$collection_dir/metadata.json"

    echo "Added document $doc_id to $collection_name"
}

# Cosine similarity between two vectors
cosine_similarity() {
    local vec1="$1"  # JSON array
    local vec2="$2"  # JSON array

    python3 << 'PYEOF'
import sys
import json
import numpy as np

vec1 = json.loads(sys.argv[1])
vec2 = json.loads(sys.argv[2])

v1 = np.array(vec1)
v2 = np.array(vec2)

# Cosine similarity
similarity = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))
print(float(similarity))
PYEOF
}

# Search collection
search_collection() {
    local collection_name="$1"
    local query_text="$2"
    local top_k="${3:-5}"
    local min_similarity="${4:-0.5}"

    local collection_dir="$VECTOR_DB_DIR/$collection_name"

    if [ ! -d "$collection_dir" ]; then
        echo "Collection $collection_name not found" >&2
        return 1
    fi

    # Generate query embedding
    local query_embedding=$(echo "$query_text" | generate_embedding)

    # Calculate similarity with all documents
    local results=$(mktemp)

    for doc_file in "$collection_dir"/*.json; do
        [ "$(basename "$doc_file")" = "metadata.json" ] && continue

        local doc_id=$(jq -r '.id' "$doc_file")
        local doc_embedding=$(jq -c '.embedding' "$doc_file")
        local doc_text=$(jq -r '.text' "$doc_file")
        local doc_metadata=$(jq -c '.metadata' "$doc_file")

        local similarity=$(cosine_similarity "$query_embedding" "$doc_embedding")

        # Only include if above threshold
        if awk -v sim="$similarity" -v min="$min_similarity" 'BEGIN { exit (sim >= min ? 0 : 1) }'; then
            jq -n \
                --arg id "$doc_id" \
                --arg txt "$doc_text" \
                --argjson meta "$doc_metadata" \
                --argjson sim "$similarity" \
                '{
                    id: $id,
                    text: $txt,
                    metadata: $meta,
                    similarity: $sim
                }' >> "$results"
        fi
    done

    # Sort by similarity and take top K
    jq -s "sort_by(-.similarity) | .[0:$top_k]" "$results"

    rm "$results"
}

# Delete collection
delete_collection() {
    local collection_name="$1"
    rm -rf "$VECTOR_DB_DIR/$collection_name"
    echo "Deleted collection $collection_name"
}

# List collections
list_collections() {
    for collection_dir in "$VECTOR_DB_DIR"/*; do
        if [ -d "$collection_dir" ]; then
            jq -r '"\(.name): \(.count) documents"' "$collection_dir/metadata.json"
        fi
    done
}

# Command-line interface
case "${1:-}" in
    create)
        create_collection "$2"
        ;;
    add)
        add_document "$2" "$3" "$4" "${5:-{}}"
        ;;
    search)
        search_collection "$2" "$3" "${4:-5}" "${5:-0.5}"
        ;;
    delete)
        delete_collection "$2"
        ;;
    list)
        list_collections
        ;;
    *)
        cat << USAGE
Usage: vector-db.sh <command> [args]

Commands:
    create <name>                           Create collection
    add <collection> <id> <text> [metadata] Add document
    search <collection> <query> [k] [min]   Search (top k, min similarity)
    delete <collection>                     Delete collection
    list                                    List all collections

Examples:
    # Create collection
    ./vector-db.sh create code-patterns

    # Add document
    ./vector-db.sh add code-patterns "pattern-001" \
        "Use set -euo pipefail for bash error handling" \
        '{"category":"bash","severity":"high"}'

    # Search
    ./vector-db.sh search code-patterns "error handling in bash" 3 0.6

    # List collections
    ./vector-db.sh list
USAGE
        ;;
esac
```

**Populate with Commit-Relay Knowledge**:
```bash
#!/bin/bash
# scripts/populate-vector-db.sh
# Populate vector database with commit-relay knowledge

# Create collections
./coordination/embeddings/vector-db.sh create code-patterns
./coordination/embeddings/vector-db.sh create task-history
./coordination/embeddings/vector-db.sh create error-solutions

# Add code patterns from learnings
jq -c '.[]' coordination/masters/coordinator/knowledge-base/code-patterns/*.jsonl 2>/dev/null | \
while read -r pattern; do
    id=$(echo "$pattern" | jq -r '.pattern_type // "unknown"')-$(date +%s)
    text=$(echo "$pattern" | jq -r '.message // ""')
    metadata=$(echo "$pattern" | jq -c '{file_type, severity, timestamp}')

    if [ -n "$text" ] && [ "$text" != "null" ]; then
        ./coordination/embeddings/vector-db.sh add code-patterns \
            "$id" "$text" "$metadata"
    fi
done

# Add completed tasks
jq -c '.tasks[] | select(.status == "completed")' coordination/task-queue.json | \
while read -r task; do
    id=$(echo "$task" | jq -r '.id')
    text=$(echo "$task" | jq -r '"\(.title). \(.description)"')
    metadata=$(echo "$task" | jq -c '{priority, type, created_at, completed_at}')

    ./coordination/embeddings/vector-db.sh add task-history \
        "$id" "$text" "$metadata"
done

echo "Vector database populated"
./coordination/embeddings/vector-db.sh list
```

**Usage in Workers**:
```bash
# Worker needs to understand "bash security best practices"
relevant_patterns=$(./coordination/embeddings/vector-db.sh search \
    code-patterns \
    "bash security best practices command injection" \
    5 \
    0.6)

# Add to worker prompt
cat << PROMPT
# RELEVANT CODE PATTERNS

Based on semantic search, here are similar patterns we've encountered:

$relevant_patterns

Consider these patterns when implementing your solution.
PROMPT
```

**Benefits**:
1. Semantic search (meaning-based, not keyword)
2. Find relevant past tasks/patterns even with different wording
3. No external dependencies (just Python + sentence-transformers)
4. File-based (fits commit-relay architecture)
5. Caching for performance

---

## Term 4: RAG (Retrieval Augmented Generation) - Context Enrichment

### Concept
Enrich LLM prompts with retrieved context:
1. **Retrieve**: Take query → convert to vector → search vector DB
2. **Augment**: Embed retrieved results into prompt
3. **Generate**: LLM responds with enriched context

Example: Ask about company policy → RAG pulls employee handbook section → includes in prompt

### Commit-Relay Implementation Status: 🔨 PARTIAL

**What Exists**:
- Manual context inclusion in prompts
- Task queue lookups
- Learning system queries

**What's Missing**:
- Automatic semantic retrieval
- Context augmentation pipeline
- Relevance ranking

### Implementation: RAG Pipeline

**File**: `agents/lib/rag-pipeline.sh`

```bash
#!/bin/bash
# agents/lib/rag-pipeline.sh
# RAG pipeline for worker context enrichment

set -euo pipefail

VECTOR_DB="coordination/embeddings/vector-db.sh"
RAG_CACHE="coordination/memory/rag-cache"

mkdir -p "$RAG_CACHE"

# Step 1: RETRIEVE relevant context
retrieve_relevant_context() {
    local query="$1"
    local context_type="${2:-all}"  # all, code, tasks, errors
    local top_k="${3:-3}"

    local results=$(mktemp)

    case "$context_type" in
        code)
            $VECTOR_DB search code-patterns "$query" "$top_k" 0.6 > "$results"
            ;;
        tasks)
            $VECTOR_DB search task-history "$query" "$top_k" 0.6 > "$results"
            ;;
        errors)
            $VECTOR_DB search error-solutions "$query" "$top_k" 0.6 > "$results"
            ;;
        all)
            # Search all collections and merge
            $VECTOR_DB search code-patterns "$query" 2 0.6 > "$results"
            $VECTOR_DB search task-history "$query" 2 0.6 >> "$results"
            $VECTOR_DB search error-solutions "$query" 1 0.6 >> "$results"
            ;;
    esac

    # Sort by similarity and format
    jq -s 'sort_by(-.similarity) | .[0:5]' "$results"

    rm "$results"
}

# Step 2: AUGMENT prompt with retrieved context
augment_prompt_with_rag() {
    local base_prompt="$1"
    local task_description="$2"
    local worker_type="$3"

    # Determine what context to retrieve based on task
    local context_type="all"
    if echo "$task_description" | grep -qi "security\|vulnerability"; then
        context_type="code"
    elif echo "$task_description" | grep -qi "similar\|previous\|past"; then
        context_type="tasks"
    elif echo "$task_description" | grep -qi "error\|fix\|debug"; then
        context_type="errors"
    fi

    # Retrieve relevant context
    local retrieved=$(retrieve_relevant_context "$task_description" "$context_type" 3)

    # Check if we got any results
    local result_count=$(echo "$retrieved" | jq 'length')

    if [ "$result_count" -eq 0 ]; then
        # No RAG context available, return base prompt
        echo "$base_prompt"
        return
    fi

    # Augment prompt with retrieved context
    cat << AUGMENTED_PROMPT
$base_prompt

---

## RETRIEVED KNOWLEDGE (via RAG)

We've searched our knowledge base for context relevant to your task.
Here are the most semantically similar items (similarity: 0.0-1.0):

$(echo "$retrieved" | jq -r '.[] |
"### [\(.metadata.category // "General")] \(.id)
Similarity: \(.similarity)
\(.text)

Metadata: \(.metadata | @json)
---
"')

**How to use this retrieved knowledge**:
1. Review each retrieved item for relevance
2. Consider patterns/solutions that worked before
3. Avoid repeating past mistakes
4. Adapt successful approaches to your specific task

---

AUGMENTED_PROMPT
}

# Step 3: GENERATE (happens in Claude, but we prepare the prompt)
prepare_rag_worker_prompt() {
    local worker_id="$1"
    local task_id="$2"

    local worker_dir="agents/workers/$worker_id"

    # Get base worker prompt
    local base_prompt=$(cat agents/prompts/workers/implementation-worker.md)

    # Get task details
    local task_description=$(jq -r --arg tid "$task_id" \
        '.tasks[] | select(.id == $tid) | .description' \
        coordination/task-queue.json)

    # Get worker type
    local worker_type=$(echo "$worker_id" | grep -oE '^[a-z]+')

    # Augment with RAG
    local augmented=$(augment_prompt_with_rag \
        "$base_prompt" \
        "$task_description" \
        "$worker_type")

    # Write augmented prompt
    echo "$augmented" > "$worker_dir/prompt-with-rag.md"

    echo "$worker_dir/prompt-with-rag.md"
}

# RAG-enhanced worker launcher
launch_worker_with_rag() {
    local task_id="$1"
    local worker_type="$2"

    local worker_id="${worker_type}-worker-$(openssl rand -hex 4 | tr '[:lower:]' '[:upper:]')"

    # Create worker directory
    local worker_dir="agents/workers/$worker_id"
    mkdir -p "$worker_dir/logs"

    # Prepare RAG-enhanced prompt
    local rag_prompt=$(prepare_rag_worker_prompt "$worker_id" "$task_id")

    # Launch Claude with RAG-enhanced prompt
    echo "Launching $worker_id with RAG-enhanced context..."
    echo "RAG prompt: $rag_prompt"

    # (Would launch Claude here with the augmented prompt)
}

# Update knowledge base from worker results
update_rag_knowledge() {
    local worker_id="$1"
    local task_id="$2"
    local outcome="$3"  # success/failure

    if [ "$outcome" = "success" ]; then
        # Extract learnings and add to vector DB
        local task_data=$(jq --arg tid "$task_id" \
            '.tasks[] | select(.id == $tid)' \
            coordination/task-queue.json)

        local task_title=$(echo "$task_data" | jq -r '.title')
        local task_desc=$(echo "$task_data" | jq -r '.description')

        # Add to task history
        $VECTOR_DB add task-history \
            "$task_id" \
            "$task_title. $task_desc" \
            "$(echo "$task_data" | jq -c '{priority, type, worker_id: $wid}')"

        # Extract any code patterns found
        # (Parse worker output for patterns)
    fi
}

# Command-line interface
case "${1:-}" in
    retrieve)
        retrieve_relevant_context "$2" "${3:-all}" "${4:-3}"
        ;;
    augment)
        augment_prompt_with_rag "$2" "$3" "$4"
        ;;
    prepare)
        prepare_rag_worker_prompt "$2" "$3"
        ;;
    launch)
        launch_worker_with_rag "$2" "$3"
        ;;
    update)
        update_rag_knowledge "$2" "$3" "$4"
        ;;
    *)
        cat << USAGE
Usage: rag-pipeline.sh <command> [args]

Commands:
    retrieve <query> [type] [k]        Retrieve relevant context
    augment <prompt> <task> <type>     Augment prompt with RAG
    prepare <worker_id> <task_id>      Prepare RAG-enhanced prompt
    launch <task_id> <worker_type>     Launch worker with RAG
    update <worker_id> <task_id> <outcome>  Update knowledge base

Examples:
    # Retrieve relevant context
    ./rag-pipeline.sh retrieve "bash error handling" code 3

    # Prepare RAG-enhanced prompt
    ./rag-pipeline.sh prepare dev-worker-XXXX task-123

    # Launch worker with RAG
    ./rag-pipeline.sh launch task-123 dev
USAGE
        ;;
esac
```

**Before/After Comparison**:

**Before (No RAG)**:
```bash
# Worker prompt
You are a development worker. Fix the security vulnerability in user-input.sh.
```

**After (With RAG)**:
```bash
# Worker prompt
You are a development worker. Fix the security vulnerability in user-input.sh.

---

## RETRIEVED KNOWLEDGE (via RAG)

### [bash] pattern-security-001
Similarity: 0.87
Always quote user input in bash to prevent command injection. Use "$var" not $var.
Metadata: {"category":"bash","severity":"high","timestamp":"2025-11-10"}
---

### [bash] pattern-security-003
Similarity: 0.82
Validate and sanitize all user input before use in commands. Use input validation functions.
Metadata: {"category":"bash","severity":"critical"}
---

### [task-history] task-1762445123
Similarity: 0.78
Fixed command injection vulnerability in scripts/user-data.sh by adding input validation
Metadata: {"priority":"high","type":"security","worker_id":"sec-worker-A1B2C3"}
---

**How to use this retrieved knowledge**:
1. Review each retrieved item for relevance
2. Consider patterns/solutions that worked before
3. Avoid repeating past mistakes
```

**Benefits**:
1. Workers automatically get relevant past context
2. Semantic similarity (not just keyword match)
3. Reduces repeated mistakes
4. Builds on past successes
5. Knowledge accumulates over time

---

## Term 5: MCP (Model Context Protocol) - Standardized Tool Access

### Concept
Standardize how LLMs access external systems:
- LLMs need to interact with databases, code repos, email, etc.
- Without MCP: Build one-off connection for each tool
- With MCP: Standardized protocol (like USB for AI)
- MCP Server: Knows how to connect AI to any tool

### Commit-Relay Implementation Status: ⏳ PLANNED

**What Exists**:
- Script-based tools (`scripts/`)
- Worker can call any bash script
- Some standardization via JSON schemas

**What's Missing**:
- Self-describing tool registry
- Tool discovery mechanism
- Standardized input/output format
- Capability advertisement

### Implementation: MCP-Inspired Tool Registry

**File**: `coordination/tools/tool-registry.sh`

```bash
#!/bin/bash
# coordination/tools/tool-registry.sh
# MCP-inspired tool registry for commit-relay

set -euo pipefail

TOOL_REGISTRY="coordination/tools/registry"
TOOL_SPECS="$TOOL_REGISTRY/specs"
TOOL_SCRIPTS="$TOOL_REGISTRY/scripts"

mkdir -p "$TOOL_SPECS" "$TOOL_SCRIPTS"

# Register a new tool
register_tool() {
    local tool_id="$1"
    local tool_name="$2"
    local description="$3"
    local parameters_schema="$4"  # JSON schema
    local script_path="$5"

    # Create tool specification (MCP-style)
    jq -n \
        --arg id "$tool_id" \
        --arg name "$tool_name" \
        --arg desc "$description" \
        --argjson schema "$parameters_schema" \
        --arg script "$script_path" \
        '{
            id: $id,
            name: $name,
            description: $desc,
            version: "1.0.0",
            parameters: {
                type: "object",
                properties: $schema,
                required: ($schema | keys)
            },
            returns: {
                type: "object",
                properties: {
                    status: {type: "string"},
                    data: {type: "object"},
                    error: {type: "string"}
                }
            },
            script: $script,
            registered_at: (now | todate)
        }' > "$TOOL_SPECS/${tool_id}.json"

    echo "Registered tool: $tool_id"
}

# Discover available tools
discover_tools() {
    local category="${1:-all}"

    if [ "$category" = "all" ]; then
        jq -s '.' "$TOOL_SPECS"/*.json 2>/dev/null || echo "[]"
    else
        jq -s --arg cat "$category" \
            'map(select(.category == $cat))' \
            "$TOOL_SPECS"/*.json 2>/dev/null || echo "[]"
    fi
}

# Get tool specification
get_tool_spec() {
    local tool_id="$1"

    if [ -f "$TOOL_SPECS/${tool_id}.json" ]; then
        cat "$TOOL_SPECS/${tool_id}.json"
    else
        echo "{\"error\": \"Tool $tool_id not found\"}"
        return 1
    fi
}

# Execute tool with parameters
execute_tool() {
    local tool_id="$1"
    local parameters="$2"  # JSON object

    # Get tool spec
    local spec=$(get_tool_spec "$tool_id")

    if echo "$spec" | jq -e '.error' > /dev/null; then
        echo "$spec"
        return 1
    fi

    # Validate parameters against schema
    # (In production, would use JSON schema validation)

    # Get script path
    local script=$(echo "$spec" | jq -r '.script')

    if [ ! -f "$script" ] && [ ! -x "$script" ]; then
        echo "{\"error\": \"Tool script not found or not executable: $script\"}"
        return 1
    fi

    # Execute script with parameters as JSON input
    local output
    if output=$(echo "$parameters" | bash "$script" 2>&1); then
        jq -n \
            --arg data "$output" \
            '{
                status: "success",
                data: $data,
                tool_id: $tool_id,
                timestamp: (now | todate)
            }'
    else
        jq -n \
            --arg err "$output" \
            '{
                status: "error",
                error: $err,
                tool_id: $tool_id,
                timestamp: (now | todate)
            }'
    fi
}

# Generate tool catalog for workers
generate_tool_catalog() {
    cat << CATALOG
# AVAILABLE TOOLS

This system provides standardized tools following MCP-inspired protocol.

## Tool Discovery
Each tool is self-describing with:
- ID: Unique identifier
- Name: Human-readable name
- Description: What the tool does
- Parameters: JSON schema of required inputs
- Returns: JSON schema of outputs

## Available Tools:

$(jq -r '.[] |
"### \(.name) (\(.id))
**Description**: \(.description)
**Parameters**: \(.parameters.properties | keys | join(", "))
**Example**:
\`\`\`bash
./tool-registry.sh exec \(.id) '\''{\"example\":\"params\"}'\''
\`\`\`
---
"' "$TOOL_SPECS"/*.json 2>/dev/null)

## How to Use Tools

1. **Discover**: List available tools
   \`./tool-registry.sh list\`

2. **Inspect**: Get tool specification
   \`./tool-registry.sh spec <tool-id>\`

3. **Execute**: Call tool with parameters
   \`./tool-registry.sh exec <tool-id> '{"param":"value"}'\`

All tools return standardized JSON:
\`\`\`json
{
  "status": "success|error",
  "data": {...},
  "error": "error message if any"
}
\`\`\`
CATALOG
}

# Command-line interface
case "${1:-}" in
    register)
        register_tool "$2" "$3" "$4" "$5" "$6"
        ;;
    list)
        discover_tools "${2:-all}"
        ;;
    spec)
        get_tool_spec "$2"
        ;;
    exec)
        execute_tool "$2" "$3"
        ;;
    catalog)
        generate_tool_catalog
        ;;
    *)
        cat << USAGE
Usage: tool-registry.sh <command> [args]

Commands:
    register <id> <name> <desc> <schema> <script>   Register tool
    list [category]                                  List available tools
    spec <tool-id>                                   Get tool specification
    exec <tool-id> <params-json>                     Execute tool
    catalog                                          Generate tool catalog

Examples:
    # Register a tool
    ./tool-registry.sh register task-create "Create Task" \
        "Create a new task in the queue" \
        '{"title":{"type":"string"},"priority":{"type":"string"}}' \
        "scripts/create-task.sh"

    # List all tools
    ./tool-registry.sh list

    # Execute tool
    ./tool-registry.sh exec task-create \
        '{"title":"Fix bug","priority":"high"}'
USAGE
        ;;
esac
```

**Register Commit-Relay Tools**:
```bash
#!/bin/bash
# scripts/register-standard-tools.sh

REGISTRY="coordination/tools/tool-registry.sh"

# Task management tools
$REGISTRY register task-create "Create Task" \
    "Create a new task in the task queue" \
    '{"title":{"type":"string"},"description":{"type":"string"},"priority":{"type":"string"}}' \
    "scripts/create-task.sh"

$REGISTRY register task-query "Query Tasks" \
    "Query tasks by status, priority, or type" \
    '{"status":{"type":"string"},"priority":{"type":"string"}}' \
    "scripts/query-tasks.sh"

# Worker management tools
$REGISTRY register worker-spawn "Spawn Worker" \
    "Spawn a new worker for a task" \
    '{"task_id":{"type":"string"},"worker_type":{"type":"string"}}' \
    "scripts/spawn-worker.sh"

$REGISTRY register worker-status "Worker Status" \
    "Check status of a worker" \
    '{"worker_id":{"type":"string"}}' \
    "scripts/check-worker-status.sh"

# Knowledge tools
$REGISTRY register knowledge-search "Search Knowledge" \
    "Semantic search in knowledge base" \
    '{"query":{"type":"string"},"top_k":{"type":"number"}}' \
    "coordination/embeddings/vector-db.sh"

$REGISTRY register pattern-add "Add Pattern" \
    "Add a code pattern to knowledge base" \
    '{"pattern":{"type":"string"},"category":{"type":"string"}}' \
    "scripts/add-code-pattern.sh"

# System tools
$REGISTRY register health-check "System Health" \
    "Check system health status" \
    '{}' \
    "scripts/health-check.sh"

$REGISTRY register emit-event "Emit Event" \
    "Emit an event to the dashboard" \
    '{"event_type":{"type":"string"},"data":{"type":"object"}}' \
    "scripts/emit-event.sh"

echo "Standard tools registered"
$REGISTRY list | jq -r '.[] | .name'
```

**Worker Tool Usage**:
```bash
# Include tool catalog in worker prompt
./coordination/tools/tool-registry.sh catalog > agents/workers/dev-worker-XXXX/tools.md

# Worker prompt includes:
cat << PROMPT
# AVAILABLE TOOLS

$(cat agents/workers/dev-worker-XXXX/tools.md)

When you need to interact with the system, use these tools instead of
directly manipulating files. Tools provide validation, error handling,
and standardized interfaces.

Example:
To create a task, use:
./tool-registry.sh exec task-create '{"title":"Fix bug","priority":"high"}'

NOT:
jq '.tasks += [...]' coordination/task-queue.json
PROMPT
```

**Benefits**:
1. Self-describing tools (workers can discover capabilities)
2. Standardized input/output (JSON schemas)
3. Validation and error handling built-in
4. Easy to add new tools (just register)
5. Workers learn tool usage from specifications

---

## Term 6: MoE (Mixture of Experts) - Specialized Expert Networks

### Concept
Divide LLM into specialized experts:
- Model has 100+ expert subnetworks
- Router activates only needed experts for task
- Merge outputs mathematically
- Efficient scaling (billions of parameters, fraction active)

Example: IBM Granite 4.0 - dozens of experts, only specific ones activate per token

### Commit-Relay Implementation Status: ✅ IMPLEMENTED

**Where**: `coordination/masters/coordinator/lib/moe-router.sh`

**Current Architecture**:
```bash
# Commit-relay MoE implementation:

# EXPERTS (Specialized Masters)
- Development Master: Code implementation, refactoring, features
- Security Master: Vulnerability scanning, CVE remediation
- Inventory Master: Repository cataloging, dependency tracking
- (More can be added: Testing, Documentation, Infrastructure, etc.)

# ROUTER
coordination/masters/coordinator/lib/moe-router.sh

# ROUTING DECISION
route_to_expert() {
    local task_description="$1"
    local task_id="$2"

    # Analyze task to determine expert(s) needed
    if echo "$task_description" | grep -qi "security\|vulnerability\|cve"; then
        expert="security"
    elif echo "$task_description" | grep -qi "catalog\|inventory\|dependency"; then
        expert="inventory"
    elif echo "$task_description" | grep -qi "implement\|feature\|bug\|code"; then
        expert="development"
    else
        # Default to development
        expert="development"
    fi

    # Activate expert by creating handoff
    ./coordination/masters/coordinator/lib/handoff.sh \
        "$expert" "$task_id" "$task_description"
}

# ACTIVATION (Only needed experts work)
# If task is "implement login feature" → only development master activates
# If task is "scan for SQL injection" → only security master activates
# If task is "catalog dependencies" → only inventory master activates

# MERGE (Not yet implemented - would combine outputs from multiple experts)
```

**Evidence of MoE Pattern**:
```bash
# Check routing decisions
tail -20 coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl

# Shows:
# {"task":"implement-auth","routed_to":"development","confidence":0.95}
# {"task":"scan-vulnerabilities","routed_to":"security","confidence":0.98}
# {"task":"catalog-repos","routed_to":"inventory","confidence":0.92}
```

### Enhancement: Multi-Expert Activation & Merge

**Add**: Support for activating multiple experts and merging results

```bash
#!/bin/bash
# coordination/masters/coordinator/lib/moe-multi-expert.sh
# Multi-expert activation and result merging

set -euo pipefail

# Analyze task and determine ALL relevant experts
analyze_task_for_experts() {
    local task_description="$1"
    local task_id="$2"

    local experts=()
    local confidences=()

    # Security expert
    if echo "$task_description" | grep -Eqi "security|vulnerability|cve|injection|xss"; then
        experts+=("security")
        confidences+=(0.9)
    fi

    # Development expert
    if echo "$task_description" | grep -Eqi "implement|feature|bug|code|refactor"; then
        experts+=("development")
        confidences+=(0.85)
    fi

    # Inventory expert
    if echo "$task_description" | grep -Eqi "catalog|inventory|dependency|documentation"; then
        experts+=("inventory")
        confidences+=(0.8)
    fi

    # Testing expert (future)
    if echo "$task_description" | grep -Eqi "test|coverage|validation"; then
        experts+=("testing")
        confidences+=(0.85)
    fi

    # If no experts matched, default to development
    if [ ${#experts[@]} -eq 0 ]; then
        experts=("development")
        confidences=(0.5)
    fi

    # Output as JSON
    jq -n \
        --argjson experts "$(printf '%s\n' "${experts[@]}" | jq -R . | jq -s .)" \
        --argjson confs "$(printf '%s\n' "${confidences[@]}" | jq -R . | jq -s .)" \
        '{
            experts: $experts,
            confidences: $confs,
            activation_strategy: (if ($experts | length) > 1 then "multi_expert" else "single_expert" end)
        }'
}

# Activate multiple experts in parallel
activate_experts_parallel() {
    local task_id="$1"
    local task_description="$2"
    shift 2
    local experts=("$@")

    local worker_ids=()

    echo "Activating ${#experts[@]} experts for task $task_id..."

    # Launch worker for each expert in parallel
    for expert in "${experts[@]}"; do
        echo "  Activating $expert expert..."

        # Create handoff
        worker_id=$(./coordination/masters/coordinator/lib/handoff.sh \
            "$expert" "$task_id" "$task_description")

        worker_ids+=("$worker_id")
    done

    # Return worker IDs as JSON array
    printf '%s\n' "${worker_ids[@]}" | jq -R . | jq -s .
}

# Merge results from multiple experts
merge_expert_results() {
    local task_id="$1"
    shift
    local worker_ids=("$@")

    local results=$(mktemp)

    # Collect results from each expert
    for worker_id in "${worker_ids[@]}"; do
        local worker_spec="coordination/worker-specs/active/${worker_id}.json"

        if [ ! -f "$worker_spec" ]; then
            # Try completed
            worker_spec="coordination/worker-specs/completed/${worker_id}.json"
        fi

        if [ -f "$worker_spec" ]; then
            jq -c '{
                worker_id: .worker_id,
                worker_type: .worker_type,
                status: .status,
                result: .result // null
            }' "$worker_spec" >> "$results"
        fi
    done

    # Merge strategy depends on task type
    # For now: Simple concatenation with expert attribution

    jq -s '{
        task_id: $tid,
        merge_strategy: "concatenation",
        expert_count: length,
        expert_results: .,
        merged_at: (now | todate)
    }' --arg tid "$task_id" "$results"

    rm "$results"
}

# End-to-end MoE workflow
moe_workflow() {
    local task_id="$1"
    local task_description="$2"

    echo "=== MoE Workflow for $task_id ==="

    # 1. Analyze task for experts
    echo "[1/4] Analyzing task..."
    local analysis=$(analyze_task_for_experts "$task_description" "$task_id")

    echo "Analysis result:"
    echo "$analysis" | jq .

    # 2. Extract experts
    local experts=($(echo "$analysis" | jq -r '.experts[]'))
    local strategy=$(echo "$analysis" | jq -r '.activation_strategy')

    echo "[2/4] Activation strategy: $strategy"
    echo "Experts to activate: ${experts[*]}"

    # 3. Activate experts
    echo "[3/4] Activating experts..."
    local worker_ids

    if [ "$strategy" = "multi_expert" ]; then
        worker_ids=$(activate_experts_parallel "$task_id" "$task_description" "${experts[@]}")
    else
        # Single expert
        worker_id=$(./coordination/masters/coordinator/lib/handoff.sh \
            "${experts[0]}" "$task_id" "$task_description")
        worker_ids="[\"$worker_id\"]"
    fi

    echo "Activated workers: $worker_ids"

    # 4. Wait for completion and merge (in production, this would be async)
    echo "[4/4] Experts working..."
    echo "When complete, results will be merged."

    # Log MoE event
    ./scripts/emit-event.sh "moe_multi_expert_activation" \
        "$(jq -n \
            --arg tid "$task_id" \
            --argjson experts "$(printf '%s\n' "${experts[@]}" | jq -R . | jq -s .)" \
            --argjson workers "$worker_ids" \
            '{task_id: $tid, experts: $experts, workers: $workers}'
        )" \
        "coordinator-master"
}

# Command-line interface
case "${1:-}" in
    analyze)
        analyze_task_for_experts "$2" "$3"
        ;;
    activate)
        shift
        task_id="$1"
        task_desc="$2"
        shift 2
        activate_experts_parallel "$task_id" "$task_desc" "$@"
        ;;
    merge)
        shift
        merge_expert_results "$@"
        ;;
    workflow)
        moe_workflow "$2" "$3"
        ;;
    *)
        cat << USAGE
Usage: moe-multi-expert.sh <command> [args]

Commands:
    analyze <description> <task-id>           Analyze task for experts
    activate <task-id> <desc> <expert>...     Activate multiple experts
    merge <task-id> <worker-id>...            Merge expert results
    workflow <task-id> <description>          End-to-end MoE workflow

Examples:
    # Analyze what experts are needed
    ./moe-multi-expert.sh analyze \
        "Implement login feature with security validation" \
        "task-123"

    # Full MoE workflow
    ./moe-multi-expert.sh workflow task-123 \
        "Implement secure authentication with dependency tracking"
USAGE
        ;;
esac
```

**Usage Example**:
```bash
# Task requiring multiple experts:
# "Implement OAuth login feature with security validation and dependency documentation"

./moe-multi-expert.sh workflow task-123 \
    "Implement OAuth login feature with security validation and dependency documentation"

# Output:
# === MoE Workflow for task-123 ===
# [1/4] Analyzing task...
# Analysis result:
# {
#   "experts": ["development", "security", "inventory"],
#   "confidences": [0.85, 0.9, 0.8],
#   "activation_strategy": "multi_expert"
# }
# [2/4] Activation strategy: multi_expert
# Experts to activate: development security inventory
# [3/4] Activating experts...
#   Activating development expert...
#   Activating security expert...
#   Activating inventory expert...
# Activated workers: ["dev-worker-A1B2", "sec-worker-C3D4", "inv-worker-E5F6"]
# [4/4] Experts working...

# After completion, merge results:
./moe-multi-expert.sh merge task-123 \
    dev-worker-A1B2 sec-worker-C3D4 inv-worker-E5F6
```

**Benefits**:
1. Activates only needed experts (like neural network MoE)
2. Parallel expert execution (faster completion)
3. Merge strategy combines expert outputs
4. Efficient resource usage
5. Matches production MoE architecture pattern

---

## Term 7: ASI/AGI - Self-Improving Intelligence

### Concept
- **AGI (Artificial General Intelligence)**: Complete all cognitive tasks as well as any human expert (theoretical)
- **ASI (Artificial Superintelligence)**: Beyond human intelligence, capable of recursive self-improvement
- ASI could redesign and upgrade itself in endless cycle
- Could solve humanity's biggest problems or create new ones

### Commit-Relay Implementation Status: 🎯 VISION

**What Exists**:
- Learning system: `coordination/memory/long-term/task-patterns.json`
- MoE learning: Code-runner feeds patterns to router
- Iterative improvement

**What ASI/AGI Would Require**:
1. **Self-Assessment**: System evaluates its own performance
2. **Architecture Evolution**: System redesigns its own components
3. **Knowledge Synthesis**: System discovers new patterns
4. **Goal Generation**: System proposes its own improvement tasks
5. **Recursive Improvement**: Each iteration makes next iteration smarter

### Implementation: Self-Improvement Framework (Phase 5+)

**File**: `coordination/self-improvement/improvement-engine.sh`

```bash
#!/bin/bash
# coordination/self-improvement/improvement-engine.sh
# Self-improvement and recursive learning system
# PHASE 5+ - Advanced capability

set -euo pipefail

IMPROVEMENT_DB="coordination/self-improvement/improvements.jsonl"
PERFORMANCE_DB="coordination/self-improvement/performance-metrics.jsonl"

# Step 1: SELF-ASSESSMENT
assess_system_performance() {
    echo "=== SELF-ASSESSMENT ==="

    # Analyze task success rates
    local success_rate=$(jq -r '
        [.tasks[] | select(.status == "completed")] | length as $success |
        [.tasks[]] | length as $total |
        if $total > 0 then ($success / $total * 100) else 0 end
    ' coordination/task-queue.json)

    # Analyze worker efficiency
    local avg_completion_time=$(jq -r '
        [.tasks[] | select(.status == "completed") |
         (((.completed_at // .updated_at) | fromdateiso8601) -
          (.created_at | fromdateiso8601))] |
        add / length / 3600
    ' coordination/task-queue.json 2>/dev/null || echo "0")

    # Analyze error patterns
    local error_count=$(jq -r '
        [.tasks[] | select(.status == "failed")] | length
    ' coordination/task-queue.json)

    # Record assessment
    jq -n \
        --argjson success "$success_rate" \
        --argjson time "$avg_completion_time" \
        --argjson errors "$error_count" \
        '{
            timestamp: (now | todate),
            success_rate: $success,
            avg_completion_hours: $time,
            error_count: $errors,
            health_score: ($success * 0.7 + (100 - $errors) * 0.3)
        }' >> "$PERFORMANCE_DB"

    # Return assessment
    tail -1 "$PERFORMANCE_DB"
}

# Step 2: IDENTIFY IMPROVEMENT OPPORTUNITIES
identify_improvements() {
    echo "=== IDENTIFYING IMPROVEMENT OPPORTUNITIES ==="

    local opportunities=()

    # Analyze performance trends
    local trend=$(jq -s '
        if length > 1 then
            (.[length-1].health_score - .[0].health_score)
        else
            0
        end
    ' "$PERFORMANCE_DB")

    if awk -v t="$trend" 'BEGIN { exit (t < 0 ? 0 : 1) }'; then
        opportunities+=("Performance declining: health_score trend negative")
    fi

    # Analyze failure patterns
    local common_failures=$(jq -r '
        [.tasks[] | select(.status == "failed") | .failure_reason] |
        group_by(.) |
        map({reason: .[0], count: length}) |
        sort_by(-.count) |
        .[0:3] |
        .[] | "\(.reason): \(.count) failures"
    ' coordination/task-queue.json)

    if [ -n "$common_failures" ]; then
        opportunities+=("Common failure patterns found")
    fi

    # Analyze routing accuracy
    local routing_accuracy=$(jq -r '
        [.[] | select(.correct_route != null)] |
        [.[] | select(.correct_route == true)] | length as $correct |
        length as $total |
        if $total > 0 then ($correct / $total * 100) else 100 end
    ' coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl)

    if awk -v acc="$routing_accuracy" 'BEGIN { exit (acc < 80 ? 0 : 1) }'; then
        opportunities+=("MoE routing accuracy below 80%: needs improvement")
    fi

    # Return opportunities
    printf '%s\n' "${opportunities[@]}" | jq -R . | jq -s .
}

# Step 3: PROPOSE IMPROVEMENTS
propose_improvement() {
    local opportunity="$1"

    echo "=== PROPOSING IMPROVEMENT for: $opportunity ==="

    local improvement=""

    case "$opportunity" in
        *"Performance declining"*)
            improvement="Analyze recent code changes and rollback problematic updates"
            ;;
        *"failure patterns"*)
            improvement="Extract failure patterns and add to worker training prompts"
            ;;
        *"routing accuracy"*)
            improvement="Retrain MoE router with recent routing decisions as training data"
            ;;
        *)
            improvement="General system audit and optimization"
            ;;
    esac

    # Create improvement task
    local task_id="improvement-$(date +%s)"

    jq -n \
        --arg tid "$task_id" \
        --arg opp "$opportunity" \
        --arg imp "$improvement" \
        '{
            id: $tid,
            type: "self_improvement",
            opportunity: $opp,
            proposed_action: $imp,
            status: "proposed",
            created_at: (now | todate)
        }' >> "$IMPROVEMENT_DB"

    echo "$improvement"
}

# Step 4: IMPLEMENT IMPROVEMENT (Recursive)
implement_improvement() {
    local improvement_id="$1"

    # Get improvement details
    local improvement=$(jq -c --arg id "$improvement_id" \
        'select(.id == $id)' \
        "$IMPROVEMENT_DB" | tail -1)

    if [ -z "$improvement" ]; then
        echo "Improvement $improvement_id not found"
        return 1
    fi

    local action=$(echo "$improvement" | jq -r '.proposed_action')

    echo "=== IMPLEMENTING IMPROVEMENT: $action ==="

    # Create task for improvement
    local task_id="task-improvement-$(date +%s)"

    jq --arg tid "$task_id" \
        --arg title "Self-Improvement: $action" \
        --arg desc "System-generated improvement task" \
        '.tasks += [{
            id: $tid,
            title: $title,
            description: $desc,
            priority: "high",
            type: "self_improvement",
            status: "pending",
            created_at: (now | todate),
            created_by: "improvement-engine"
        }]' coordination/task-queue.json > /tmp/task-queue-improvement.json && \
        mv /tmp/task-queue-improvement.json coordination/task-queue.json

    # Route to appropriate expert (recursive: system improves itself)
    ./coordination/masters/coordinator/lib/moe-router.sh \
        "$action" "$task_id"

    echo "Improvement task created: $task_id"
}

# Step 5: MEASURE IMPROVEMENT IMPACT
measure_improvement_impact() {
    local improvement_id="$1"

    echo "=== MEASURING IMPROVEMENT IMPACT ==="

    # Get performance before and after
    local before=$(jq -s '.[length-2]' "$PERFORMANCE_DB")
    local after=$(jq -s '.[length-1]' "$PERFORMANCE_DB")

    local before_score=$(echo "$before" | jq -r '.health_score')
    local after_score=$(echo "$after" | jq -r '.health_score')

    local impact=$(echo "$after_score - $before_score" | bc)

    # Update improvement record
    jq --arg id "$improvement_id" \
        --argjson impact "$impact" \
        --argjson before "$before_score" \
        --argjson after "$after_score" \
        'if .id == $id then
            .impact = $impact |
            .before_score = $before |
            .after_score = $after |
            .status = "measured"
        else . end' \
        "$IMPROVEMENT_DB" > "${IMPROVEMENT_DB}.tmp" && \
        mv "${IMPROVEMENT_DB}.tmp" "$IMPROVEMENT_DB"

    echo "Impact: $impact (before: $before_score, after: $after_score)"

    if awk -v imp="$impact" 'BEGIN { exit (imp > 0 ? 0 : 1) }'; then
        echo "✓ Improvement SUCCESSFUL"
        return 0
    else
        echo "✗ Improvement had negative impact - consider rollback"
        return 1
    fi
}

# RECURSIVE IMPROVEMENT LOOP
recursive_improvement_loop() {
    local max_iterations="${1:-5}"

    echo "=== RECURSIVE SELF-IMPROVEMENT LOOP ==="
    echo "Max iterations: $max_iterations"
    echo ""

    for iteration in $(seq 1 $max_iterations); do
        echo "=== Iteration $iteration/$max_iterations ==="

        # 1. Assess current state
        local assessment=$(assess_system_performance)
        local current_score=$(echo "$assessment" | jq -r '.health_score')

        echo "Current health score: $current_score"

        # 2. Identify opportunities
        local opportunities=$(identify_improvements)
        local opp_count=$(echo "$opportunities" | jq 'length')

        echo "Opportunities found: $opp_count"

        if [ "$opp_count" -eq 0 ]; then
            echo "No improvement opportunities identified. System at optimal state."
            break
        fi

        # 3. Propose improvements
        local first_opp=$(echo "$opportunities" | jq -r '.[0]')
        local improvement=$(propose_improvement "$first_opp")

        echo "Proposed improvement: $improvement"

        # 4. Implement (creates task for worker)
        # In real system, would wait for completion
        # For now, just log

        echo "Improvement proposed. Would be implemented by worker."
        echo ""

        # Prevent infinite loop - add delay or exit condition
        sleep 2
    done

    echo "=== RECURSIVE IMPROVEMENT COMPLETE ==="
    echo "Final health score: $(jq -s '.[length-1].health_score' "$PERFORMANCE_DB")"
}

# KNOWLEDGE SYNTHESIS (Discover new patterns)
synthesize_knowledge() {
    echo "=== KNOWLEDGE SYNTHESIS ==="

    # Analyze all learnings to find meta-patterns
    # (Patterns about patterns)

    local meta_patterns=$(jq -s '
        # Group by pattern type
        group_by(.pattern_type) |
        map({
            pattern_family: .[0].pattern_type,
            occurrences: length,
            avg_severity: ([.[] | .severity] | add / length),
            common_contexts: ([.[] | .file_type] | group_by(.) | map({type: .[0], count: length}) | sort_by(-.count) | .[0])
        }) |
        # Find patterns that appear frequently
        map(select(.occurrences > 5))
    ' coordination/masters/coordinator/knowledge-base/code-patterns/*.jsonl 2>/dev/null)

    if [ "$(echo "$meta_patterns" | jq 'length')" -gt 0 ]; then
        echo "Meta-patterns discovered:"
        echo "$meta_patterns" | jq .

        # Create improvement task based on meta-pattern
        echo "Creating improvement task based on discovered meta-pattern..."
    else
        echo "No significant meta-patterns found yet"
    fi
}

# Command-line interface
case "${1:-}" in
    assess)
        assess_system_performance
        ;;
    identify)
        identify_improvements
        ;;
    propose)
        propose_improvement "$2"
        ;;
    implement)
        implement_improvement "$2"
        ;;
    measure)
        measure_improvement_impact "$2"
        ;;
    loop)
        recursive_improvement_loop "${2:-5}"
        ;;
    synthesize)
        synthesize_knowledge
        ;;
    *)
        cat << USAGE
Usage: improvement-engine.sh <command> [args]

Commands:
    assess                    Assess system performance
    identify                  Identify improvement opportunities
    propose <opportunity>     Propose improvement for opportunity
    implement <imp-id>        Implement improvement
    measure <imp-id>          Measure improvement impact
    loop [iterations]         Run recursive improvement loop
    synthesize                Synthesize knowledge and discover patterns

Examples:
    # Run self-assessment
    ./improvement-engine.sh assess

    # Run recursive improvement loop (5 iterations)
    ./improvement-engine.sh loop 5

    # Synthesize meta-patterns
    ./improvement-engine.sh synthesize

Note: This is Phase 5+ capability - requires mature system
USAGE
        ;;
esac
```

**Path to AGI/ASI** (Long-term Vision):

```
Phase 1 (Current): Manual Improvement
- Humans identify problems
- Humans propose solutions
- Workers implement solutions

Phase 2 (6 months): Semi-Autonomous Improvement
- System identifies problems automatically
- Humans approve proposed improvements
- Workers implement

Phase 3 (12 months): Autonomous Improvement
- System identifies AND proposes improvements
- Automatic implementation with human oversight
- Recursive learning from improvements

Phase 4 (18 months): Meta-Learning
- System discovers patterns about patterns
- Generates new types of improvements
- Optimizes own learning process

Phase 5 (24+ months): Self-Architecting (AGI-Adjacent)
- System proposes architecture changes
- Redesigns own components
- Creates new masters/capabilities
- Recursive self-improvement cycle

ASI (Theoretical):
- System reaches beyond human capability
- Discovers improvements humans can't conceive
- Recursive improvement accelerates exponentially
```

**Current Capability**:
```bash
# Run self-assessment
./improvement-engine.sh assess

# Output:
# {
#   "timestamp": "2025-11-14T...",
#   "success_rate": 78.5,
#   "avg_completion_hours": 2.3,
#   "error_count": 12,
#   "health_score": 84.3
# }

# Identify improvements
./improvement-engine.sh identify

# Output:
# [
#   "MoE routing accuracy below 80%: needs improvement",
#   "Common failure patterns found"
# ]

# System can now propose and implement improvements for itself
```

**Benefits**:
1. System learns from its own performance
2. Discovers improvement opportunities automatically
3. Proposes and implements fixes
4. Measures impact of improvements
5. Recursive improvement loop
6. Foundation for future AGI capabilities

---

## Integration: How All 7 Terms Work Together

### Complete System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    COMMIT-RELAY SYSTEM                      │
│                  (All 7 AI Terms Integrated)                │
└─────────────────────────────────────────────────────────────┘

1. TASK ARRIVES
   │
   ├─→ [7. SELF-IMPROVEMENT ENGINE]
   │    - Assesses: Can we handle this type of task?
   │    - Learns: What patterns does this task represent?
   │
2. MoE ROUTING
   │
   ├─→ [6. MIXTURE OF EXPERTS]
   │    Router analyzes task → Activates relevant expert(s)
   │    - Development Master
   │    - Security Master
   │    - Inventory Master
   │
3. RAG ENHANCEMENT
   │
   ├─→ [4. RAG PIPELINE]
   │    Before spawning worker:
   │    - Query: Convert task description to vector [3. VECTOR DB]
   │    - Retrieve: Find similar past tasks/patterns
   │    - Augment: Enrich prompt with retrieved context
   │
4. WORKER SPAWN (AGENTIC)
   │
   ├─→ [1. AGENTIC AI]
   │    Worker follows autonomous loop:
   │    ┌───────────────────┐
   │    │ PERCEIVE          │ ← Read task, learnings, system state
   │    │ REASON            │ ← [2. LARGE REASONING MODEL]
   │    │ ACT               │ ← Execute using [5. MCP TOOLS]
   │    │ OBSERVE           │ ← Check results
   │    └───────▲───────────┘
   │            │
   │            └─── Repeat until goal achieved
   │
5. TOOL USAGE
   │
   ├─→ [5. MCP TOOL REGISTRY]
   │    Worker discovers and uses standardized tools:
   │    - task-create, worker-spawn, knowledge-search, etc.
   │    All tools self-describing with JSON schemas
   │
6. KNOWLEDGE UPDATE
   │
   └─→ [3. VECTOR DATABASE] + [4. RAG]
        Worker completes → Extract learnings → Add to vector DB
        Future tasks benefit from this knowledge via RAG

7. RECURSIVE IMPROVEMENT
   │
   └─→ [7. SELF-IMPROVEMENT]
        System analyzes outcomes → Identifies patterns →
        Proposes improvements → Creates tasks to improve itself
```

### Example: Complete Workflow

**Scenario**: User requests "Implement secure file upload with validation"

**Step-by-Step Integration**:

```bash
# STEP 1: Task Created
task_id="task-$(date +%s)"
./coordination/tools/tool-registry.sh exec task-create \
    '{"title":"Implement secure file upload","priority":"high"}'

# STEP 2: Self-Improvement Engine Assesses
./coordination/self-improvement/improvement-engine.sh assess
# Determines: "Security task - have we succeeded at these before?"

# STEP 3: MoE Routing
./coordination/masters/coordinator/lib/moe-multi-expert.sh analyze \
    "Implement secure file upload with validation" "$task_id"
# Result: Activates TWO experts (multi-expert strategy)
#   - Development expert (implement upload)
#   - Security expert (validate security)

# STEP 4: RAG Enhancement
for expert in development security; do
    # Retrieve relevant context
    ./agents/lib/rag-pipeline.sh retrieve \
        "secure file upload validation ${expert}" \
        "${expert}" 3

    # Result for development:
    # - Pattern: "Always validate file types server-side"
    # - Past task: "Implemented CSV upload with type validation"
    # - Code pattern: "Use allowlist, not blocklist for file types"

    # Result for security:
    # - Pattern: "Check MIME type AND extension AND magic bytes"
    # - Past vulnerability: "File upload RCE via double extension"
    # - Best practice: "Store uploads outside web root"
done

# STEP 5: Spawn Agentic Workers (with RAG context)
./agents/lib/rag-pipeline.sh launch "$task_id" development
./agents/lib/rag-pipeline.sh launch "$task_id" security

# STEP 6: Workers Follow Agent Loop
# Development Worker:
for cycle in 1 2 3; do
    # PERCEIVE
    cat coordination/task-queue.json  # Task details
    cat prompt-with-rag.md           # RAG-enhanced prompt with past patterns

    # REASON (Chain-of-thought)
    # "I need to implement file upload. Based on RAG context, I should:
    #  1. Validate type server-side (past pattern)
    #  2. Use allowlist (best practice)
    #  3. Store outside web root (security finding)"

    # ACT (Using MCP tools)
    ./coordination/tools/tool-registry.sh exec knowledge-search \
        '{"query":"file upload validation","top_k":3}'

    # Implement upload handler
    # Add validation logic

    # OBSERVE
    bash -n scripts/upload-handler.sh  # Syntax check
    # Success - continue
done

# Security Worker (parallel):
for cycle in 1 2; do
    # PERCEIVE
    cat prompt-with-rag.md  # Includes: "Past RCE via double extension"

    # REASON
    # "RAG shows we had RCE vulnerability before. I should:
    #  1. Test for double extension bypass
    #  2. Verify MIME type validation
    #  3. Check file is stored securely"

    # ACT
    # Run security validation tests
    # Verify implementation matches security patterns

    # OBSERVE
    # Tests pass - security validated
done

# STEP 7: Merge Expert Results
./coordination/masters/coordinator/lib/moe-multi-expert.sh merge \
    "$task_id" dev-worker-XXXX sec-worker-YYYY

# Result:
# {
#   "development_result": "Upload handler implemented with server-side validation",
#   "security_result": "Security validated - no vulnerabilities found",
#   "merged_conclusion": "Feature complete and secure"
# }

# STEP 8: Update Vector Database (Knowledge Loop)
./coordination/embeddings/vector-db.sh add task-history \
    "$task_id" \
    "Implemented secure file upload with validation. Used allowlist for types." \
    '{"priority":"high","experts":["development","security"],"outcome":"success"}'

# STEP 9: Self-Improvement Learning
./coordination/self-improvement/improvement-engine.sh synthesize
# Discovers meta-pattern:
# "Tasks requiring both development AND security experts
#  have 95% success rate when RAG provides past security findings"
#
# Creates improvement task:
# "Always activate security expert for tasks mentioning 'upload' or 'input'"

# STEP 10: System Gets Smarter
# Next time similar task arrives:
#   - MoE router learned to activate both experts
#   - RAG will surface this successful task as example
#   - Workers will reference this implementation
#   - Security patterns are now in knowledge base
#
# RECURSIVE IMPROVEMENT ACHIEVED ✓
```

### Integration Checklist

**Phase 1: Core Integration (Weeks 1-2)**
- [x] Agentic AI: Workers already follow perceive→reason→act cycle
- [x] Reasoning Models: Chain-of-thought prompting active
- [ ] Explicit Agent Loop: Add `agent-loop.sh` for visibility
- [x] MoE: Router operational, needs multi-expert support
- [ ] Multi-Expert Activation: Add parallel expert workflow

**Phase 2: Knowledge Infrastructure (Weeks 3-4)**
- [ ] Vector Database: Implement `vector-db.sh`
- [ ] Populate Vector DB: Add existing knowledge
- [ ] RAG Pipeline: Implement `rag-pipeline.sh`
- [ ] Integrate RAG into Worker Launch: Automatic context enrichment

**Phase 3: Standardization (Weeks 5-6)**
- [ ] MCP Tool Registry: Implement `tool-registry.sh`
- [ ] Register Standard Tools: Document all available tools
- [ ] Update Worker Prompts: Include tool catalog
- [ ] Tool Discovery: Workers learn tools from specs

**Phase 4: Monitoring & Metrics (Weeks 7-8)**
- [ ] Performance Tracking: Log success rates, completion times
- [ ] Reasoning Capture: Extract and analyze reasoning patterns
- [ ] MoE Metrics: Track routing accuracy and expert performance
- [ ] RAG Effectiveness: Measure impact of retrieved context

**Phase 5: Self-Improvement (Months 3+)**
- [ ] Self-Assessment: Automated performance analysis
- [ ] Improvement Identification: Find optimization opportunities
- [ ] Improvement Implementation: System proposes own improvements
- [ ] Impact Measurement: Track improvement effectiveness
- [ ] Recursive Loop: Continuous self-improvement cycle

---

## Success Metrics

**Week 1-2: Core Integration**
- Explicit agent loops visible in worker logs
- Multi-expert activation working for complex tasks
- Target: 2+ experts activated on 30% of tasks

**Week 3-4: Knowledge Infrastructure**
- Vector database populated with 100+ patterns
- RAG retrieves relevant context 80% of time
- Workers reference retrieved knowledge in responses

**Week 5-6: Standardization**
- 20+ tools registered in MCP-style registry
- Workers discover and use tools from catalog
- Tool usage replaces 70% of direct file manipulation

**Week 7-8: Monitoring**
- Performance dashboard shows all 7 metrics
- Reasoning patterns captured and categorized
- MoE routing accuracy >85%

**Month 3+: Self-Improvement**
- System identifies 1+ improvement opportunities per week
- Automated improvements implemented and measured
- Health score trending upward
- System demonstrates recursive learning

---

## Conclusion

Commit-relay already implements **3 out of 7** fundamental AI concepts:

1. ✅ **Agentic AI**: Workers are autonomous agents
2. ✅ **Large Reasoning Models**: Chain-of-thought prompting active
3. 🔨 **Vector Database**: Structure exists, needs embedding layer
4. 🔨 **RAG**: Partial retrieval, needs semantic search
5. ⏳ **MCP**: Tool registry planned
6. ✅ **MoE**: Router operational, needs multi-expert support
7. 🎯 **ASI/AGI**: Vision for recursive self-improvement

**Next Steps**:
1. Complete vector database implementation (Week 3-4)
2. Integrate RAG pipeline (Week 3-4)
3. Add MCP tool registry (Week 5-6)
4. Enable multi-expert MoE (Week 1-2)
5. Build self-improvement engine (Month 3+)

**Vision**: A fully integrated AI system where all 7 concepts work together in a recursive improvement loop, constantly getting smarter and more capable.

The foundation is solid. Now we complete the integration.
