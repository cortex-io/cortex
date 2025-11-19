# AI Agent Fundamentals - commit-relay Implementation Guide

**Source**: Don't learn AI Agents without Learning these Fundamentals.pdf
**Author**: Comprehensive tutorial covering LLMs, embeddings, vector DBs, RAG, LangChain, LangGraph, MCP
**Target**: Map AI agent fundamentals to commit-relay's bash-based architecture

---

## Executive Summary

This guide translates foundational AI agent concepts into practical bash implementations for commit-relay. Covers:
- Context window management for worker prompts
- Embedding-based knowledge retrieval
- Bash-based RAG pipeline
- State management for multi-step workflows
- Tool integration patterns (MCP-inspired)

**Key Insight**: "The shift from static documents to living intelligent systems marks a turning point for how every business can unlock the full value of its knowledge using agents."

---

## 1. Context Window Management

### Problem
**Challenge from PDF**: "Even the largest context window, like Gemini 2.5 Pro's 1 million tokens, can hold only about 50 files of typical business documents all at once."

**commit-relay Context**: Workers have limited context in their prompts. Must optimize what goes into worker prompt templates.

### Solution: Intelligent Context Injection

```bash
# coordination/context/context-manager.sh
# Manages what context gets injected into worker prompts

calculate_token_estimate() {
    local text="$1"
    # Rough estimate: 1 token ≈ 0.75 words (English)
    local word_count=$(echo "$text" | wc -w)
    echo $(( word_count * 4 / 3 ))
}

build_worker_context() {
    local task_id="$1"
    local worker_type="$2"
    local max_tokens="${3:-20000}"  # Conservative limit

    local context=""
    local token_count=0

    # Priority 1: Task details (always include)
    local task_data=$(jq --arg tid "$task_id" \
        '.tasks[] | select(.id == $tid)' \
        coordination/task-queue.json)

    context+="# TASK\n$task_data\n\n"
    token_count=$(calculate_token_estimate "$context")

    # Priority 2: Recent relevant learnings
    local remaining_tokens=$((max_tokens - token_count))
    if [ "$remaining_tokens" -gt 5000 ]; then
        local learnings=$(get_relevant_learnings "$task_id" "$worker_type" "$remaining_tokens")
        context+="# LEARNINGS\n$learnings\n\n"
        token_count=$(calculate_token_estimate "$context")
    fi

    # Priority 3: System state (if room)
    remaining_tokens=$((max_tokens - token_count))
    if [ "$remaining_tokens" -gt 3000 ]; then
        local system_state=$(get_compact_system_state "$remaining_tokens")
        context+="# SYSTEM STATE\n$system_state\n\n"
    fi

    echo "$context"
}

# Example: Filter out irrelevant info (like the "apples are red" example)
filter_irrelevant_context() {
    local full_context="$1"
    local task_description="$2"

    # Extract keywords from task
    local keywords=$(echo "$task_description" | \
        tr '[:upper:]' '[:lower:]' | \
        grep -oE '\b[a-z]{4,}\b' | \
        sort -u)

    # Keep only context paragraphs mentioning task keywords
    # (Simple relevance filter - could enhance with embeddings)
    echo "$full_context" | awk -v kw="$keywords" '
        BEGIN { RS="\n\n"; ORS="\n\n" }
        {
            for (i in kw) {
                if (tolower($0) ~ kw[i]) {
                    print
                    break
                }
            }
        }
    '
}
```

**Usage**:
```bash
# When spawning a worker
TASK_CONTEXT=$(build_worker_context "$TASK_ID" "development" 20000)

# Inject into worker prompt
sed "s/{{TASK_CONTEXT}}/$TASK_CONTEXT/" \
    agents/prompts/workers/dev-worker.md > /tmp/worker-prompt-$WORKER_ID.md
```

---

## 2. Embeddings & Semantic Search (Bash-Native)

### Problem
**Challenge from PDF**: "Traditional keyword search can't connect 'reset password' with 'password recovery process'"

**commit-relay Need**: Find relevant past tasks, learnings, code patterns by meaning, not exact keywords

### Solution: Embedding Pipeline with Local Models

```bash
# coordination/embeddings/embedding-service.sh
# Uses sentence-transformers via Python for embeddings

EMBEDDING_MODEL="all-MiniLM-L6-v2"  # Fast, 384 dimensions
EMBEDDINGS_DIR="coordination/embeddings/vectors"

mkdir -p "$EMBEDDINGS_DIR"

# Generate embedding for text
generate_embedding() {
    local text="$1"
    local output_file="${2:-/dev/stdout}"

    python3 << 'PYEOF' "$text" "$output_file"
import sys
from sentence_transformers import SentenceTransformer
import json

text = sys.argv[1]
output_file = sys.argv[2]

model = SentenceTransformer('all-MiniLM-L6-v2')
embedding = model.encode(text).tolist()

if output_file == '/dev/stdout':
    print(json.dumps(embedding))
else:
    with open(output_file, 'w') as f:
        json.dump(embedding, f)
PYEOF
}

# Index a document (task, learning, code snippet)
index_document() {
    local doc_id="$1"
    local doc_type="$2"  # task, learning, code_pattern
    local text="$3"
    local metadata="$4"  # JSON object

    local vector_file="$EMBEDDINGS_DIR/${doc_type}-${doc_id}.json"

    # Generate embedding
    local embedding=$(generate_embedding "$text")

    # Store with metadata
    jq -n \
        --arg id "$doc_id" \
        --arg type "$doc_type" \
        --argjson vector "$embedding" \
        --argjson meta "$metadata" \
        '{
            id: $id,
            type: $type,
            vector: $vector,
            metadata: $meta,
            indexed_at: (now | todate)
        }' > "$vector_file"

    log "Indexed $doc_type: $doc_id (384 dimensions)"
}

# Semantic search using cosine similarity
semantic_search() {
    local query="$1"
    local doc_type="${2:-*}"  # Filter by type
    local top_k="${3:-5}"

    # Generate query embedding
    local query_vector=$(generate_embedding "$query")

    # Calculate similarity with all indexed vectors
    python3 << 'PYEOF' "$query_vector" "$doc_type" "$top_k"
import sys
import json
import glob
from pathlib import Path
import numpy as np

query_vector = np.array(json.loads(sys.argv[1]))
doc_type = sys.argv[2]
top_k = int(sys.argv[3])

# Cosine similarity function
def cosine_similarity(v1, v2):
    return np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))

# Load all vectors
results = []
pattern = f"coordination/embeddings/vectors/{doc_type}-*.json"
for vec_file in glob.glob(pattern):
    with open(vec_file) as f:
        doc = json.load(f)

    doc_vector = np.array(doc['vector'])
    similarity = cosine_similarity(query_vector, doc_vector)

    results.append({
        'id': doc['id'],
        'type': doc['type'],
        'similarity': float(similarity),
        'metadata': doc['metadata']
    })

# Sort by similarity (descending)
results.sort(key=lambda x: x['similarity'], reverse=True)

# Return top K
print(json.dumps(results[:top_k], indent=2))
PYEOF
}
```

**Usage Examples**:

```bash
# Index completed tasks
index_completed_tasks() {
    jq -c '.tasks[] | select(.status == "completed")' \
        coordination/task-queue.json | \
    while read task; do
        task_id=$(echo "$task" | jq -r '.id')
        text=$(echo "$task" | jq -r '.title + " " + .description')
        metadata=$(echo "$task" | jq '{title, type, created_at, tags}')

        index_document "$task_id" "task" "$text" "$metadata"
    done
}

# Index code patterns from MoE learnings
index_code_patterns() {
    find coordination/masters/coordinator/knowledge-base/code-patterns -name "*.jsonl" | \
    while read pattern_file; do
        jq -c '.' "$pattern_file" | while read pattern; do
            pattern_id=$(echo "$pattern" | jq -r '.pattern_type + "-" + (.timestamp | gsub("[^0-9]"; ""))')
            text=$(echo "$pattern" | jq -r '.message')
            metadata=$(echo "$pattern" | jq '{pattern_type, severity, file_type}')

            index_document "$pattern_id" "code_pattern" "$text" "$metadata"
        done
    done
}

# Search: Find similar tasks
find_similar_tasks() {
    local new_task_description="$1"

    echo "Finding tasks similar to: $new_task_description"
    echo ""

    semantic_search "$new_task_description" "task" 5 | \
    jq -r '.[] | "[\(.similarity | tostring | .[0:4])] \(.metadata.title)"'
}

# Example
find_similar_tasks "Fix bug in worker launcher template injection"
# Output:
# [0.87] Investigate Worker Launcher Script Bug
# [0.72] Fix task context injection failure
# [0.68] Debug template substitution in spawner
```

---

## 3. Vector Database (Bash-Native ChromaDB Alternative)

### Problem
**Challenge from PDF**: "We need a system to store and search through [embeddings] efficiently. That's where ChromaDB comes in."

**commit-relay Need**: Lightweight vector storage that works with bash

### Solution: JSON-Based Vector Store with Efficient Search

```bash
# coordination/vector-db/vector-store.sh
# Lightweight vector database in bash

VECTOR_DB_DIR="coordination/vector-db"
COLLECTIONS_DIR="$VECTOR_DB_DIR/collections"

mkdir -p "$COLLECTIONS_DIR"

# Create a collection
create_collection() {
    local collection_name="$1"
    local embedding_dim="${2:-384}"  # all-MiniLM-L6-v2 default

    local collection_dir="$COLLECTIONS_DIR/$collection_name"
    mkdir -p "$collection_dir"

    jq -n \
        --arg name "$collection_name" \
        --argjson dim "$embedding_dim" \
        '{
            name: $name,
            embedding_dimension: $dim,
            created_at: (now | todate),
            document_count: 0,
            metadata: {}
        }' > "$collection_dir/metadata.json"

    log "Created collection: $collection_name ($embedding_dim dims)"
}

# Add document to collection
add_to_collection() {
    local collection_name="$1"
    local doc_id="$2"
    local text="$3"
    local metadata="${4:-{}}"

    local collection_dir="$COLLECTIONS_DIR/$collection_name"

    # Generate embedding
    local embedding=$(python3 -c "
from sentence_transformers import SentenceTransformer
import json
model = SentenceTransformer('all-MiniLM-L6-v2')
embedding = model.encode('$text').tolist()
print(json.dumps(embedding))
")

    # Store document
    local doc_file="$collection_dir/docs/$doc_id.json"
    mkdir -p "$collection_dir/docs"

    jq -n \
        --arg id "$doc_id" \
        --arg text "$text" \
        --argjson vector "$embedding" \
        --argjson meta "$metadata" \
        '{
            id: $id,
            text: $text,
            vector: $vector,
            metadata: $meta,
            added_at: (now | todate)
        }' > "$doc_file"

    # Update collection metadata
    jq '.document_count += 1' "$collection_dir/metadata.json" > /tmp/meta.json
    mv /tmp/meta.json "$collection_dir/metadata.json"
}

# Query collection (semantic search)
query_collection() {
    local collection_name="$1"
    local query_text="$2"
    local n_results="${3:-5}"
    local score_threshold="${4:-0.5}"  # Minimum similarity

    local collection_dir="$COLLECTIONS_DIR/$collection_name"

    # Generate query embedding
    local query_vector=$(python3 -c "
from sentence_transformers import SentenceTransformer
import json
model = SentenceTransformer('all-MiniLM-L6-v2')
embedding = model.encode('$query_text').tolist()
print(json.dumps(embedding))
")

    # Search all documents
    python3 << 'PYEOF' "$collection_dir" "$query_vector" "$n_results" "$score_threshold"
import sys
import json
import glob
import numpy as np
from pathlib import Path

collection_dir = sys.argv[1]
query_vector = np.array(json.loads(sys.argv[2]))
n_results = int(sys.argv[3])
score_threshold = float(sys.argv[4])

def cosine_similarity(v1, v2):
    return np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))

results = []
for doc_file in glob.glob(f"{collection_dir}/docs/*.json"):
    with open(doc_file) as f:
        doc = json.load(f)

    doc_vector = np.array(doc['vector'])
    similarity = cosine_similarity(query_vector, doc_vector)

    if similarity >= score_threshold:
        results.append({
            'id': doc['id'],
            'text': doc['text'],
            'similarity': float(similarity),
            'metadata': doc['metadata']
        })

results.sort(key=lambda x: x['similarity'], reverse=True)
print(json.dumps(results[:n_results], indent=2))
PYEOF
}
```

**Usage Example**:

```bash
# Create knowledge base collection
create_collection "commit-relay-knowledge" 384

# Add all task documentation
jq -c '.tasks[] | select(.status == "completed")' coordination/task-queue.json | \
while read task; do
    task_id=$(echo "$task" | jq -r '.id')
    text=$(echo "$task" | jq -r '.title + ". " + .description')
    metadata=$(echo "$task" | jq '{type, priority, tags}')

    add_to_collection "commit-relay-knowledge" "$task_id" "$text" "$metadata"
done

# Query for relevant knowledge
query_collection "commit-relay-knowledge" \
    "How do I fix worker script errors?" \
    5 \
    0.6
```

---

## 4. RAG (Retrieval Augmented Generation) Pipeline

### Problem
**Challenge from PDF**: "RAG is a very powerful system that can instantly improve the depth of knowledge beyond its training data."

**commit-relay Need**: Workers should access relevant past knowledge when solving tasks

### Solution: Bash-Based RAG Pipeline

```bash
# agents/lib/rag-pipeline.sh
# RAG pipeline for commit-relay workers

source coordination/vector-db/vector-store.sh
source coordination/embeddings/embedding-service.sh

# Step 1: Retrieval
retrieve_relevant_context() {
    local query="$1"
    local collection="${2:-commit-relay-knowledge}"
    local top_k="${3:-3}"

    log "[RAG] Retrieving context for: $query"

    # Semantic search
    local results=$(query_collection "$collection" "$query" "$top_k" 0.6)

    # Format results as context
    echo "$results" | jq -r '.[] |
        "## [\(.id)] (similarity: \(.similarity | tostring | .[0:4]))\n\(.text)\n"'
}

# Step 2: Augmentation
augment_prompt_with_context() {
    local base_prompt="$1"
    local task_description="$2"
    local worker_type="$3"

    log "[RAG] Augmenting prompt with retrieved context"

    # Retrieve relevant knowledge
    local context=$(retrieve_relevant_context "$task_description" "commit-relay-knowledge" 3)

    # Inject into prompt template
    cat << PROMPT
$base_prompt

## RETRIEVED KNOWLEDGE

The following information was retrieved from past completed tasks that may be relevant:

$context

## YOUR TASK

$task_description

IMPORTANT: Use the retrieved knowledge above to inform your approach, but adapt it to the specific requirements of this task. If the retrieved knowledge seems irrelevant, you may ignore it.
PROMPT
}

# Step 3: Generation (happens in Claude worker)
# The worker receives the augmented prompt and generates response

# Full RAG workflow
rag_workflow() {
    local task_id="$1"
    local worker_type="$2"

    # Get task details
    local task=$(jq --arg tid "$task_id" \
        '.tasks[] | select(.id == $tid)' \
        coordination/task-queue.json)

    local task_description=$(echo "$task" | jq -r '.description')
    local base_prompt=$(cat "agents/prompts/workers/${worker_type}-worker.md")

    # Retrieve + Augment
    local augmented_prompt=$(augment_prompt_with_context \
        "$base_prompt" \
        "$task_description" \
        "$worker_type")

    # Save augmented prompt
    local prompt_file="agents/workers/temp/rag-prompt-$task_id.md"
    echo "$augmented_prompt" > "$prompt_file"

    log "[RAG] Augmented prompt saved: $prompt_file"
    echo "$prompt_file"
}
```

**Worker Integration**:

```bash
# scripts/claude-worker-launcher-v2.sh (RAG-enabled)

if [ "$RAG_ENABLED" = "true" ]; then
    # Use RAG pipeline to create augmented prompt
    WORKER_PROMPT=$(rag_workflow "$TASK_ID" "$WORKER_TYPE")
else
    # Use standard prompt template
    WORKER_PROMPT="agents/prompts/workers/${WORKER_TYPE}-worker.md"
fi

# Launch worker with prompt
claude < "$WORKER_PROMPT"
```

**Chunking Strategy**:

```bash
# coordination/vector-db/chunking.sh
# Smart document chunking (from PDF: "preserve meaning")

chunk_document() {
    local document="$1"
    local chunk_size="${2:-500}"  # characters
    local chunk_overlap="${3:-100}"  # preserve context

    python3 << 'PYEOF' "$document" "$chunk_size" "$chunk_overlap"
import sys

document = sys.argv[1]
chunk_size = int(sys.argv[2])
chunk_overlap = int(sys.argv[3])

# Split by paragraph first (preserve complete thoughts)
paragraphs = document.split('\n\n')

chunks = []
current_chunk = ""

for para in paragraphs:
    if len(current_chunk) + len(para) <= chunk_size:
        current_chunk += para + "\n\n"
    else:
        if current_chunk:
            chunks.append(current_chunk.strip())
        current_chunk = para + "\n\n"

if current_chunk:
    chunks.append(current_chunk.strip())

# Add overlap (PDF: "preserve meaning across boundaries")
overlapped_chunks = []
for i, chunk in enumerate(chunks):
    if i > 0:
        # Include last N chars of previous chunk
        overlap = chunks[i-1][-chunk_overlap:]
        overlapped_chunks.append(overlap + " " + chunk)
    else:
        overlapped_chunks.append(chunk)

for chunk in overlapped_chunks:
    print(chunk)
    print("---CHUNK---")
PYEOF
}
```

---

## 5. Prompt Engineering Techniques

### Problem
**Challenge from PDF**: "The quality of your prompt directly impacts the quality of responses you receive."

**commit-relay Need**: Workers need different prompting strategies for different task types

### Solution: Prompt Library with Multiple Strategies

```bash
# agents/prompts/lib/prompt-strategies.sh

# Zero-shot: No examples, rely on model's knowledge
zero_shot_prompt() {
    local task_description="$1"

    cat << PROMPT
You are a commit-relay worker agent.

Task: $task_description

Complete this task using your knowledge and available tools.
PROMPT
}

# One-shot: Single example
one_shot_prompt() {
    local task_description="$1"
    local example_task="$2"
    local example_solution="$3"

    cat << PROMPT
You are a commit-relay worker agent.

## Example Task
$example_task

## Example Solution
$example_solution

## Your Task
$task_description

Follow the same approach as demonstrated in the example.
PROMPT
}

# Few-shot: Multiple examples
few_shot_prompt() {
    local task_description="$1"
    shift
    local examples=("$@")

    cat << PROMPT
You are a commit-relay worker agent.

## Example Tasks and Solutions

PROMPT

    local i=1
    for example in "${examples[@]}"; do
        echo "### Example $i"
        echo "$example"
        echo ""
        ((i++))
    done

    cat << PROMPT

## Your Task
$task_description

Use the patterns demonstrated in the examples above.
PROMPT
}

# Chain-of-thought: Step-by-step reasoning
chain_of_thought_prompt() {
    local task_description="$1"
    local reasoning_steps="$2"

    cat << PROMPT
You are a commit-relay worker agent.

Task: $task_description

Before solving this task, follow these reasoning steps:

$reasoning_steps

For each step:
1. State what you're doing
2. Explain your reasoning
3. Show your work
4. Verify the result

Only after completing all reasoning steps, provide your final solution.
PROMPT
}
```

**Auto-Select Strategy**:

```bash
# coordination/prompt-router.sh
# Automatically choose prompting strategy based on task

select_prompt_strategy() {
    local task="$1"

    local task_type=$(echo "$task" | jq -r '.type')
    local complexity=$(echo "$task" | jq -r '.complexity // "medium"')

    # Complex reasoning tasks → chain-of-thought
    if [[ "$complexity" == "high" ]] || echo "$task_description" | grep -qi "analyze\|investigate\|debug"; then
        echo "chain-of-thought"
        return
    fi

    # Repetitive tasks with known patterns → few-shot
    if [[ "$task_type" == "code_quality" ]] || [[ "$task_type" == "compliance" ]]; then
        echo "few-shot"
        return
    fi

    # Standard tasks → one-shot
    if [[ "$task_type" == "development" ]] || [[ "$task_type" == "security" ]]; then
        echo "one-shot"
        return
    fi

    # Default → zero-shot
    echo "zero-shot"
}

# Build prompt with selected strategy
build_optimized_prompt() {
    local task_id="$1"

    local task=$(jq --arg tid "$task_id" '.tasks[] | select(.id == $tid)' coordination/task-queue.json)
    local strategy=$(select_prompt_strategy "$task")

    log "Selected prompt strategy: $strategy"

    case "$strategy" in
        "chain-of-thought")
            # Load reasoning template for task type
            local reasoning=$(cat "agents/prompts/reasoning/$(echo "$task" | jq -r '.type').md")
            chain_of_thought_prompt "$(echo "$task" | jq -r '.description')" "$reasoning"
            ;;
        "few-shot")
            # Load examples from past successful tasks
            local examples=($(get_successful_examples "$(echo "$task" | jq -r '.type')" 3))
            few_shot_prompt "$(echo "$task" | jq -r '.description')" "${examples[@]}"
            ;;
        "one-shot")
            # Load single best example
            local example=$(get_best_example "$(echo "$task" | jq -r '.type')")
            one_shot_prompt "$(echo "$task" | jq -r '.description')" "$example"
            ;;
        *)
            zero_shot_prompt "$(echo "$task" | jq -r '.description')"
            ;;
    esac
}
```

**Reasoning Templates** (Chain-of-Thought):

```bash
# agents/prompts/reasoning/investigation.md

## Investigation Reasoning Steps

Follow these steps when investigating issues:

1. **Understand the Symptom**
   - What is the observed behavior?
   - When does it occur?
   - Who reported it?

2. **Gather Evidence**
   - What logs are available?
   - What files are involved?
   - What recent changes occurred?

3. **Form Hypotheses**
   - List 3-5 possible root causes
   - Rank by likelihood
   - Explain reasoning for each

4. **Test Hypotheses**
   - Design tests for each hypothesis
   - Execute tests systematically
   - Document results

5. **Identify Root Cause**
   - Which hypothesis was confirmed?
   - What evidence supports this?
   - Are there contributing factors?

6. **Propose Solution**
   - What fixes the root cause?
   - What prevents recurrence?
   - What are the risks?
```

---

## 6. LangGraph-Inspired Workflow Engine (Bash)

### Problem
**Challenge from PDF**: "When business requirements become more complex like multi-step workflows, conditional branching or iterative processes, you need something more sophisticated."

**commit-relay Need**: Complex tasks require multi-step execution with conditional logic

### Solution: State Graph in Bash

```bash
# coordination/workflows/state-graph.sh
# LangGraph-inspired workflow engine for bash

WORKFLOW_DIR="coordination/workflows"
WORKFLOW_STATE_DIR="$WORKFLOW_DIR/state"

mkdir -p "$WORKFLOW_STATE_DIR"

# Define a workflow graph
create_workflow() {
    local workflow_id="$1"
    local workflow_name="$2"

    local workflow_file="$WORKFLOW_DIR/definitions/${workflow_id}.json"
    mkdir -p "$WORKFLOW_DIR/definitions"

    jq -n \
        --arg id "$workflow_id" \
        --arg name "$workflow_name" \
        '{
            id: $id,
            name: $name,
            nodes: [],
            edges: [],
            state_schema: {},
            created_at: (now | todate)
        }' > "$workflow_file"

    log "Created workflow: $workflow_name"
}

# Add node to workflow
add_node() {
    local workflow_id="$1"
    local node_id="$2"
    local node_script="$3"  # Path to bash script
    local node_description="$4"

    local workflow_file="$WORKFLOW_DIR/definitions/${workflow_id}.json"

    jq --arg nid "$node_id" \
       --arg script "$node_script" \
       --arg desc "$node_description" \
       '.nodes += [{
           id: $nid,
           script: $script,
           description: $desc
       }]' "$workflow_file" > /tmp/workflow.json

    mv /tmp/workflow.json "$workflow_file"
}

# Add edge between nodes
add_edge() {
    local workflow_id="$1"
    local from_node="$2"
    local to_node="$3"
    local condition="${4:-always}"  # Bash expression or "always"

    local workflow_file="$WORKFLOW_DIR/definitions/${workflow_id}.json"

    jq --arg from "$from_node" \
       --arg to "$to_node" \
       --arg cond "$condition" \
       '.edges += [{
           from: $from,
           to: $to,
           condition: $cond
       }]' "$workflow_file" > /tmp/workflow.json

    mv /tmp/workflow.json "$workflow_file"
}

# Execute workflow
execute_workflow() {
    local workflow_id="$1"
    local task_id="$2"
    local initial_state="${3:-{}}"

    local workflow_file="$WORKFLOW_DIR/definitions/${workflow_id}.json"
    local state_file="$WORKFLOW_STATE_DIR/${workflow_id}-${task_id}.json"

    # Initialize state
    echo "$initial_state" | jq '. + {
        workflow_id: "'$workflow_id'",
        task_id: "'$task_id'",
        current_node: "start",
        completed_nodes: [],
        started_at: (now | todate)
    }' > "$state_file"

    log "[WORKFLOW] Starting $workflow_id for task $task_id"

    # Get starting node
    local current_node=$(jq -r '.nodes[0].id' "$workflow_file")

    # Execute nodes
    while [ -n "$current_node" ] && [ "$current_node" != "end" ]; do
        log "[WORKFLOW] Executing node: $current_node"

        # Get node script
        local node_script=$(jq -r --arg nid "$current_node" \
            '.nodes[] | select(.id == $nid) | .script' \
            "$workflow_file")

        # Execute node (pass state file path)
        if bash "$node_script" "$state_file"; then
            # Mark node as completed
            jq --arg nid "$current_node" \
                '.completed_nodes += [$nid]' \
                "$state_file" > /tmp/state.json
            mv /tmp/state.json "$state_file"

            # Find next node (conditional routing)
            current_node=$(get_next_node "$workflow_file" "$current_node" "$state_file")
        else
            log "[WORKFLOW] Node failed: $current_node"
            jq '.status = "failed" | .failed_node = "'$current_node'"' \
                "$state_file" > /tmp/state.json
            mv /tmp/state.json "$state_file"
            return 1
        fi
    done

    # Mark workflow complete
    jq '.status = "completed" | .completed_at = (now | todate)' \
        "$state_file" > /tmp/state.json
    mv /tmp/state.json "$state_file"

    log "[WORKFLOW] Completed: $workflow_id"
}

# Get next node (conditional routing)
get_next_node() {
    local workflow_file="$1"
    local current_node="$2"
    local state_file="$3"

    # Load state
    local state=$(cat "$state_file")

    # Find all edges from current node
    local edges=$(jq --arg from "$current_node" \
        '.edges[] | select(.from == $from)' \
        "$workflow_file")

    # Evaluate conditions
    echo "$edges" | jq -c '.' | while read edge; do
        local condition=$(echo "$edge" | jq -r '.condition')
        local to_node=$(echo "$edge" | jq -r '.to')

        if [ "$condition" = "always" ]; then
            echo "$to_node"
            return
        fi

        # Evaluate bash condition with state context
        if eval "$condition"; then
            echo "$to_node"
            return
        fi
    done
}
```

**Example Workflow**: GDPR Compliance Check

```bash
# Create compliance workflow
create_workflow "gdpr-compliance" "GDPR Compliance Analysis"

# Node 1: Search policy documents
add_node "gdpr-compliance" "search-docs" \
    "coordination/workflows/nodes/search-privacy-docs.sh" \
    "Search and gather privacy policy documents"

# Node 2: Extract content
add_node "gdpr-compliance" "extract-content" \
    "coordination/workflows/nodes/extract-doc-content.sh" \
    "Extract and clean document content"

# Node 3: Evaluate compliance
add_node "gdpr-compliance" "evaluate-gdpr" \
    "coordination/workflows/nodes/evaluate-gdpr-compliance.sh" \
    "Evaluate GDPR compliance using LLM"

# Node 4: Check score (conditional branch)
add_node "gdpr-compliance" "check-score" \
    "coordination/workflows/nodes/check-compliance-score.sh" \
    "Check if compliance score meets threshold"

# Node 5a: Generate recommendations
add_node "gdpr-compliance" "generate-recommendations" \
    "coordination/workflows/nodes/generate-compliance-recommendations.sh" \
    "Generate compliance recommendations"

# Node 5b: Create report
add_node "gdpr-compliance" "create-report" \
    "coordination/workflows/nodes/create-compliance-report.sh" \
    "Create final compliance report"

# Define edges
add_edge "gdpr-compliance" "search-docs" "extract-content" "always"
add_edge "gdpr-compliance" "extract-content" "evaluate-gdpr" "always"
add_edge "gdpr-compliance" "evaluate-gdpr" "check-score" "always"

# Conditional branching
add_edge "gdpr-compliance" "check-score" "search-docs" \
    'jq -r ".compliance_score < 75" "$state_file" | grep -q true'  # Loop back if score low

add_edge "gdpr-compliance" "check-score" "generate-recommendations" \
    'jq -r ".compliance_score >= 75 and .compliance_score < 90" "$state_file" | grep -q true'

add_edge "gdpr-compliance" "check-score" "create-report" \
    'jq -r ".compliance_score >= 90" "$state_file" | grep -q true'

add_edge "gdpr-compliance" "generate-recommendations" "create-report" "always"
```

**Node Implementation Example**:

```bash
# coordination/workflows/nodes/evaluate-gdpr-compliance.sh

#!/bin/bash
STATE_FILE="$1"

# Read state
DOCUMENTS=$(jq -r '.documents[]' "$STATE_FILE")

# Evaluate compliance (call Claude)
COMPLIANCE_ANALYSIS=$(cat << PROMPT | claude
You are a GDPR compliance expert.

Analyze these privacy policy documents for GDPR compliance:

$DOCUMENTS

Provide:
1. Compliance score (0-100)
2. List of gaps found
3. Recommendation summary

Output JSON format:
{
  "compliance_score": <number>,
  "gaps": ["gap1", "gap2"],
  "summary": "text"
}
PROMPT
)

# Update state
jq --argjson analysis "$COMPLIANCE_ANALYSIS" \
    '. + $analysis' \
    "$STATE_FILE" > /tmp/state-updated.json

mv /tmp/state-updated.json "$STATE_FILE"

# Success
exit 0
```

---

## 7. MCP-Inspired Tool Integration

### Problem
**Challenge from PDF**: "MCP provides self-describing interfaces that AI agents can understand and use autonomously."

**commit-relay Need**: Workers should discover and use tools without hardcoding

### Solution: Tool Registry with Self-Description

```bash
# coordination/tools/tool-registry.sh
# MCP-inspired tool system for commit-relay

TOOLS_DIR="coordination/tools"
TOOL_SPECS_DIR="$TOOLS_DIR/specs"

mkdir -p "$TOOL_SPECS_DIR"

# Register a tool (self-describing)
register_tool() {
    local tool_id="$1"
    local tool_name="$2"
    local tool_script="$3"
    local description="$4"
    local parameters_schema="$5"  # JSON schema

    jq -n \
        --arg id "$tool_id" \
        --arg name "$tool_name" \
        --arg script "$tool_script" \
        --arg desc "$description" \
        --argjson schema "$parameters_schema" \
        '{
            id: $id,
            name: $name,
            script: $script,
            description: $desc,
            parameters: $schema,
            registered_at: (now | todate)
        }' > "$TOOL_SPECS_DIR/${tool_id}.json"

    log "Registered tool: $tool_name"
}

# List available tools (for worker discovery)
list_tools() {
    local category="${1:-*}"

    find "$TOOL_SPECS_DIR" -name "*.json" | while read spec_file; do
        jq '{id, name, description, parameters}' "$spec_file"
    done | jq -s '.'
}

# Generate tool documentation for worker prompt
generate_tool_docs() {
    cat << 'DOCS'
# AVAILABLE TOOLS

You have access to the following tools. To use a tool, output JSON in this format:
```json
{
  "tool": "tool_id",
  "parameters": {
    "param1": "value1"
  }
}
```

DOCS

    find "$TOOL_SPECS_DIR" -name "*.json" | while read spec_file; do
        local tool=$(cat "$spec_file")

        echo "## $(echo "$tool" | jq -r '.name')"
        echo ""
        echo "$(echo "$tool" | jq -r '.description')"
        echo ""
        echo "**Parameters**:"
        echo '```json'
        echo "$tool" | jq '.parameters'
        echo '```'
        echo ""
    done
}

# Execute tool (called by worker)
execute_tool() {
    local tool_id="$1"
    local parameters="$2"  # JSON

    local spec_file="$TOOL_SPECS_DIR/${tool_id}.json"

    if [ ! -f "$spec_file" ]; then
        echo "{\"error\": \"Tool not found: $tool_id\"}"
        return 1
    fi

    local tool_script=$(jq -r '.script' "$spec_file")

    # Execute tool with parameters
    echo "$parameters" | bash "$tool_script"
}
```

**Example Tool Registrations**:

```bash
# Register task queue tool
register_tool \
    "get_pending_tasks" \
    "Get Pending Tasks" \
    "coordination/tools/impl/get-pending-tasks.sh" \
    "Retrieve all pending tasks from the task queue" \
    '{
        "type": "object",
        "properties": {
            "limit": {
                "type": "number",
                "description": "Maximum number of tasks to return",
                "default": 10
            },
            "priority": {
                "type": "string",
                "enum": ["low", "medium", "high", "critical"],
                "description": "Filter by priority"
            }
        }
    }'

# Register file search tool
register_tool \
    "search_files" \
    "Search Files" \
    "coordination/tools/impl/search-files.sh" \
    "Search for files matching pattern using glob" \
    '{
        "type": "object",
        "properties": {
            "pattern": {
                "type": "string",
                "description": "Glob pattern (e.g. **/*.sh)"
            },
            "directory": {
                "type": "string",
                "description": "Directory to search in",
                "default": "."
            }
        },
        "required": ["pattern"]
    }'

# Register git operations tool
register_tool \
    "git_log" \
    "Git Log" \
    "coordination/tools/impl/git-log.sh" \
    "Get git commit history" \
    '{
        "type": "object",
        "properties": {
            "count": {
                "type": "number",
                "description": "Number of commits to show",
                "default": 10
            },
            "since": {
                "type": "string",
                "description": "Show commits since date (e.g. '2 weeks ago')"
            },
            "author": {
                "type": "string",
                "description": "Filter by author name"
            }
        }
    }'
```

**Tool Implementation Example**:

```bash
# coordination/tools/impl/get-pending-tasks.sh

#!/bin/bash
# Reads JSON parameters from stdin

PARAMS=$(cat)

LIMIT=$(echo "$PARAMS" | jq -r '.limit // 10')
PRIORITY=$(echo "$PARAMS" | jq -r '.priority // "all"')

# Query task queue
TASKS=$(jq -c '.tasks[] | select(.status == "pending")' \
    /Users/ryandahlberg/commit-relay/coordination/task-queue.json)

# Filter by priority if specified
if [ "$PRIORITY" != "all" ]; then
    TASKS=$(echo "$TASKS" | jq -c "select(.priority == \"$PRIORITY\")")
fi

# Limit results
TASKS=$(echo "$TASKS" | head -n "$LIMIT")

# Return JSON array
echo "$TASKS" | jq -s '.'
```

**Worker Prompt with Tools**:

```markdown
# Development Worker

You are an autonomous development worker for commit-relay.

$(generate_tool_docs)

## Task

[TASK_DESCRIPTION]

## Instructions

1. Analyze the task
2. Use available tools to gather information
3. Implement solution
4. Verify results

To use a tool, output:
```json
{"tool": "tool_id", "parameters": {...}}
```
```

---

## 8. Integration Roadmap

### Phase 1: Context & Embeddings (Week 1-2)

**Deliverables**:
- [ ] Context manager with token estimation
- [ ] Embedding service (sentence-transformers)
- [ ] Vector indexing for tasks, learnings, code patterns
- [ ] Basic semantic search

**Scripts to Create**:
- `coordination/context/context-manager.sh`
- `coordination/embeddings/embedding-service.sh`
- `coordination/embeddings/index-knowledge.sh`

**Success Metric**: Workers can retrieve top 3 relevant past tasks with >70% relevance

---

### Phase 2: RAG Pipeline (Week 3-4)

**Deliverables**:
- [ ] Vector store (JSON-based)
- [ ] Document chunking with overlap
- [ ] RAG pipeline (retrieve + augment)
- [ ] Integration with worker launcher

**Scripts to Create**:
- `coordination/vector-db/vector-store.sh`
- `coordination/vector-db/chunking.sh`
- `agents/lib/rag-pipeline.sh`
- `scripts/claude-worker-launcher-rag.sh`

**Success Metric**: RAG-enabled workers complete tasks 30% faster with fewer errors

---

### Phase 3: Prompt Engineering (Week 5)

**Deliverables**:
- [ ] Prompt strategy library (zero/one/few-shot, CoT)
- [ ] Auto-selection based on task type
- [ ] Reasoning templates for complex tasks
- [ ] Success rate tracking by strategy

**Scripts to Create**:
- `agents/prompts/lib/prompt-strategies.sh`
- `coordination/prompt-router.sh`
- `agents/prompts/reasoning/*.md` (templates)

**Success Metric**: Complex investigation tasks show 50% improvement with CoT prompting

---

### Phase 4: Workflow Engine (Week 6-7)

**Deliverables**:
- [ ] State graph execution engine
- [ ] Conditional routing logic
- [ ] Multi-step workflow definitions
- [ ] State persistence across nodes

**Scripts to Create**:
- `coordination/workflows/state-graph.sh`
- `coordination/workflows/definitions/*.json`
- `coordination/workflows/nodes/*.sh`

**Success Metric**: GDPR compliance workflow completes automatically with 95% accuracy

---

### Phase 5: Tool System (Week 8)

**Deliverables**:
- [ ] Tool registry with self-description
- [ ] Tool documentation generator
- [ ] Worker-tool integration
- [ ] Common tools (tasks, files, git, vector search)

**Scripts to Create**:
- `coordination/tools/tool-registry.sh`
- `coordination/tools/impl/*.sh` (tool implementations)
- `agents/lib/tool-executor.sh`

**Success Metric**: Workers autonomously discover and use 5+ tools per task

---

## 9. Quick Wins (Implement Today)

### Win #1: Token-Aware Context Injection

```bash
# Replace static prompts with token-limited context
# In scripts/claude-worker-launcher-v2.sh

TASK_CONTEXT=$(build_worker_context "$TASK_ID" "development" 20000)
sed "s/{{TASK_CONTEXT}}/$TASK_CONTEXT/" \
    agents/prompts/workers/dev-worker.md > /tmp/worker-prompt.md
```

**Impact**: Prevents context overflow, improves relevance

---

### Win #2: Index Completed Tasks

```bash
# Add to task-completion-daemon.sh

on_task_complete() {
    local task_id="$1"

    # Existing completion logic...

    # NEW: Index for semantic search
    local task=$(jq --arg tid "$task_id" '.tasks[] | select(.id == $tid)' coordination/task-queue.json)
    local text=$(echo "$task" | jq -r '.title + " " + .description')
    local metadata=$(echo "$task" | jq '{type, priority, tags, status}')

    index_document "$task_id" "task" "$text" "$metadata"
}
```

**Impact**: Build knowledge base automatically

---

### Win #3: Chain-of-Thought for Investigations

```bash
# In coordination/masters/coordinator/lib/moe-router.sh

if echo "$task_description" | grep -qi "investigate\|debug\|analyze"; then
    # Use chain-of-thought prompting
    REASONING=$(cat agents/prompts/reasoning/investigation.md)
    WORKER_PROMPT=$(chain_of_thought_prompt "$task_description" "$REASONING")
fi
```

**Impact**: Immediate improvement on debugging tasks

---

## 10. Monitoring & Learning

### Track Prompt Performance

```bash
# coordination/analytics/prompt-performance.sh

record_prompt_performance() {
    local task_id="$1"
    local strategy="$2"
    local success="$3"  # true/false
    local completion_time="$4"  # seconds

    jq -n \
        --arg tid "$task_id" \
        --arg strat "$strategy" \
        --arg success "$success" \
        --argjson time "$completion_time" \
        '{
            task_id: $tid,
            strategy: $strat,
            success: ($success == "true"),
            completion_time_seconds: $time,
            timestamp: (now | todate)
        }' >> coordination/analytics/prompt-performance.jsonl
}

# Analyze which strategies work best
analyze_prompt_strategies() {
    cat coordination/analytics/prompt-performance.jsonl | \
    jq -s 'group_by(.strategy) |
        map({
            strategy: .[0].strategy,
            total: length,
            success_rate: (map(select(.success)) | length / length),
            avg_time: (map(.completion_time_seconds) | add / length)
        }) |
        sort_by(-.success_rate)'
}
```

### RAG Quality Metrics

```bash
# Track retrieval relevance
log_rag_retrieval() {
    local task_id="$1"
    local query="$2"
    local retrieved_docs="$3"  # JSON array with similarity scores

    # Calculate average similarity
    local avg_similarity=$(echo "$retrieved_docs" | jq '[.[] | .similarity] | add / length')

    # Log to analytics
    jq -n \
        --arg tid "$task_id" \
        --arg query "$query" \
        --argjson docs "$retrieved_docs" \
        --argjson avg "$avg_similarity" \
        '{
            task_id: $tid,
            query: $query,
            retrieved_count: ($docs | length),
            avg_similarity: $avg,
            timestamp: (now | todate)
        }' >> coordination/analytics/rag-retrieval.jsonl
}
```

---

## 11. Key Takeaways

### From PDF to commit-relay

1. **Context Windows Matter**
   - Don't stuff prompts with irrelevant info
   - Use token estimation to stay within limits
   - Prioritize: Task → Recent learnings → System state

2. **Embeddings Enable Semantic Search**
   - Index completed tasks, learnings, code patterns
   - Search by meaning, not keywords
   - Use lightweight models (all-MiniLM-L6-v2)

3. **RAG = Retrieve + Augment + Generate**
   - Retrieve relevant context from vector DB
   - Augment worker prompt with context
   - Let Claude generate solution with fresh knowledge

4. **Prompt Engineering is Critical**
   - Use zero-shot for simple tasks
   - Use few-shot for repetitive patterns
   - Use chain-of-thought for complex reasoning

5. **Workflows Need State**
   - Multi-step tasks require state management
   - Conditional routing based on intermediate results
   - Loop back if quality threshold not met

6. **Tools Should Be Discoverable**
   - Self-describing tool registry
   - Workers discover tools dynamically
   - Standard JSON interface for tool calls

---

## 12. Success Metrics

**By implementing these fundamentals, commit-relay should achieve**:

- **60% reduction** in worker prompt tokens (context optimization)
- **30% faster** task completion (RAG providing relevant knowledge)
- **50% improvement** on investigation tasks (chain-of-thought)
- **95% success** on multi-step workflows (state graph)
- **5+ tools** autonomously used per task (tool registry)

**Quote from PDF**: "This is the same architecture that powers tools like ChatGPT, Claude, and Gemini."

commit-relay is building this architecture in bash.

---

## Appendix: Python Dependencies

```bash
# Install required libraries
pip3 install sentence-transformers numpy

# Test installation
python3 -c "from sentence_transformers import SentenceTransformer; print('✓ Ready')"
```

---

**END OF IMPLEMENTATION GUIDE**

Generated: 2025-11-14
PDF: Don't learn AI Agents without Learning these Fundamentals.pdf
Pages: 22
Implementation Time: 8 weeks (phased)
