# RAG vs Fine-Tuning vs Prompt Engineering - commit-relay Strategy Guide

**Source**: RAG vs Fine-Tuning vs Prompt Engineering: Optimizing AI Models.pdf
**Author**: Martin Keen (IBM)
**Target**: Decision framework for choosing optimization strategies in commit-relay

---

## Executive Summary

This guide provides a decision framework for when to use RAG, Fine-Tuning, or Prompt Engineering in commit-relay. Based on Martin Keen's comparison, we map each technique to specific use cases in our autonomous agent system.

**Key Quote**: "They're commonly used actually in combination. We might use all three together."

**commit-relay Strategy**: Use all three techniques simultaneously, each for different aspects of the system.

---

## The Three Optimization Techniques

### 1. RAG (Retrieval Augmented Generation)

**Definition**: Retrieve external data → Augment prompt → Generate response

**How It Works**:
```
Query → Vector Search → Find Relevant Docs → Add to Prompt → LLM Response
```

**Strengths**:
- ✅ Up-to-date information
- ✅ Domain-specific data
- ✅ Easy to update (just add documents)
- ✅ No model retraining needed

**Weaknesses**:
- ❌ Adds latency (retrieval step)
- ❌ Infrastructure costs (vector DB)
- ❌ Processing costs (embeddings)

---

### 2. Fine-Tuning

**Definition**: Additional specialized training on focused dataset to update model weights

**How It Works**:
```
Base Model + Specialized Data → Training (GPU) → Updated Weights → Specialized Model
```

**Strengths**:
- ✅ Deep domain expertise
- ✅ Faster inference (no retrieval)
- ✅ No vector DB maintenance
- ✅ Knowledge baked into weights

**Weaknesses**:
- ❌ Training complexity (thousands of examples)
- ❌ Computational cost (GPUs)
- ❌ Maintenance (retraining for updates)
- ❌ Catastrophic forgetting risk

---

### 3. Prompt Engineering

**Definition**: Better activate existing capabilities through well-crafted prompts

**How It Works**:
```
Basic Prompt: "Is this code secure?"
Engineered Prompt: "As a security expert, review this code for vulnerabilities. Check for: SQL injection, XSS, authentication bypasses. Provide: severity, location, fix. Format as JSON."
```

**Strengths**:
- ✅ No infrastructure changes
- ✅ Immediate results
- ✅ Zero cost (besides prompt tokens)
- ✅ User-controlled

**Weaknesses**:
- ❌ Trial and error process
- ❌ Limited to existing knowledge
- ❌ Can't add truly new information
- ❌ Won't fix outdated information

---

## Decision Framework for commit-relay

### Use RAG When...

**Scenario**: Information changes frequently or is external

**commit-relay Examples**:
- ✅ Past task results and learnings
- ✅ Code patterns from completed work
- ✅ System state (current workers, queue)
- ✅ Recent commits and changes
- ✅ External API documentation
- ✅ Project documentation

**Implementation**:
```bash
# Already building in ai-agent-fundamentals-implementation.md
coordination/vector-db/vector-store.sh
coordination/embeddings/embedding-service.sh
agents/lib/rag-pipeline.sh
```

**When NOT to use RAG**:
- ❌ Core bash scripting knowledge (use prompt engineering)
- ❌ commit-relay architectural patterns (use fine-tuning)
- ❌ High-frequency queries (latency issues)

---

### Use Fine-Tuning When...

**Scenario**: Deep domain expertise needed, rarely changes

**commit-relay Examples**:
- ✅ commit-relay-specific patterns (MoE routing, worker patterns)
- ✅ Bash scripting best practices for our codebase
- ✅ JSON state management conventions
- ✅ Tool usage patterns
- ✅ Error handling strategies

**Implementation Plan**:
```bash
# Phase 1: Collect training examples
coordination/fine-tuning/training-data/

# Example training pairs
{
  "input": "Create a worker for task-123 with type development",
  "output": "WORKER_ID=$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -d'-' -f1)\njq -n --arg wid \"$WORKER_ID\" --arg tid \"task-123\" '{worker_id: $wid, task_id: $tid, worker_type: \"development\", status: \"pending\"}' > coordination/worker-specs/active/$WORKER_ID.json"
}

# Phase 2: Fine-tune Claude (if Anthropic supports)
# OR create examples for few-shot prompting
```

**When NOT to use Fine-Tuning**:
- ❌ Frequently changing information (use RAG)
- ❌ Small dataset (<1000 examples)
- ❌ Quick prototyping phase
- ❌ No GPU resources available

---

### Use Prompt Engineering When...

**Scenario**: Quick improvements, no infrastructure changes

**commit-relay Examples**:
- ✅ All worker prompts (immediate improvement)
- ✅ Task-specific instructions
- ✅ Output format requirements
- ✅ Reasoning guidance (chain-of-thought)
- ✅ Role definitions

**Implementation**:

**Before (Basic)**:
```markdown
You are a development worker. Complete this task:
{{TASK_DESCRIPTION}}
```

**After (Engineered)**:
```markdown
# ROLE
You are an expert bash developer specializing in autonomous multi-agent systems.

# EXPERTISE
- Bash scripting with error handling (set -euo pipefail)
- JSON manipulation with jq
- State management in file-based systems
- Worker coordination patterns

# TASK
{{TASK_DESCRIPTION}}

# APPROACH
1. Analyze requirements carefully
2. Check existing patterns in codebase
3. Implement with proper error handling
4. Test thoroughly
5. Document state changes

# OUTPUT FORMAT
Provide:
1. Solution code
2. Test commands
3. State changes made
4. Files modified

Think step-by-step before implementing.
```

**When NOT to use Prompt Engineering**:
- ❌ Need truly new knowledge (use RAG)
- ❌ Consistent behavior across all tasks (use fine-tuning)
- ❌ Outdated information needs correction (use RAG or fine-tuning)

---

## Combined Strategy for commit-relay

**Best Practice**: Use all three together for maximum effectiveness

### Example: Security Worker

**1. Prompt Engineering** (Role & Format)
```markdown
# ROLE
You are a security expert specializing in bash script vulnerabilities.

# CHECK FOR
- Command injection
- Unsafe eval usage
- Unquoted variables
- Secrets in code
- rm -rf dangers

# OUTPUT FORMAT
JSON array of findings:
[{
  "severity": "critical|high|medium|low",
  "type": "command_injection|secrets|unsafe_command",
  "file": "path/to/file.sh",
  "line": 42,
  "description": "...",
  "fix": "..."
}]
```

**2. RAG** (Recent Patterns)
```bash
# Retrieve similar past vulnerabilities found
semantic_search "bash security vulnerabilities command injection" \
    "code_pattern" 5

# Add to prompt:
# RECENT VULNERABILITIES FOUND IN CODEBASE:
# - scripts/foo.sh:23 - Unquoted variable in rm command
# - coordination/bar.sh:45 - eval without sanitization
```

**3. Fine-Tuning** (commit-relay Conventions)
```json
{
  "input": "Review this bash script for security issues",
  "output": "Checking commit-relay security standards:\n1. Has set -euo pipefail\n2. All variables quoted\n3. No eval without # eval: safe comment\n4. JSON state files validated\n5. Secrets loaded from env vars only"
}
```

**Result**: Security worker that:
- Knows commit-relay conventions (fine-tuned)
- Learns from past findings (RAG)
- Follows structured process (prompt engineering)

---

## Implementation Roadmap

### Phase 1: Prompt Engineering (Week 1) - IMMEDIATE WINS

**Goal**: Improve all worker prompts with zero infrastructure changes

**Tasks**:
- [ ] Audit current worker prompt templates
- [ ] Add role definitions
- [ ] Add expertise areas
- [ ] Add structured output formats
- [ ] Add reasoning guidance (chain-of-thought)
- [ ] Add examples (few-shot)

**Script**:
```bash
# agents/prompts/lib/prompt-optimizer.sh

optimize_worker_prompt() {
    local base_prompt="$1"
    local worker_type="$2"

    cat << OPTIMIZED
# ROLE
You are an expert $worker_type for commit-relay, a bash-based autonomous multi-agent system.

# EXPERTISE
$(get_expertise_for_type "$worker_type")

# COMMIT-RELAY CONVENTIONS
- All bash scripts use 'set -euo pipefail'
- State stored in JSON files (coordination/)
- Workers communicate via file system
- jq used for all JSON manipulation
- Errors logged to agents/logs/

# TASK
$base_prompt

# APPROACH
1. Read relevant state files
2. Plan implementation step-by-step
3. Execute with error handling
4. Update state atomically (write to tmp, then mv)
5. Log all actions

# OUTPUT REQUIREMENTS
- Clear success/failure indication
- State changes documented
- Files modified listed
- Next steps suggested

Think through this methodically before coding.
OPTIMIZED
}
```

**Success Metric**: 30% improvement in task completion rate

---

### Phase 2: RAG Implementation (Week 2-3) - KNOWLEDGE BASE

**Goal**: Workers access past learnings automatically

**Already Designed**: See `ai-agent-fundamentals-implementation.md`

**Quick Start**:
```bash
# Index all completed tasks
jq -c '.tasks[] | select(.status == "completed")' \
    coordination/task-queue.json | \
while read task; do
    task_id=$(echo "$task" | jq -r '.id')
    text=$(echo "$task" | jq -r '.title + " " + .description')

    # Generate embedding and store
    python3 -c "
from sentence_transformers import SentenceTransformer
model = SentenceTransformer('all-MiniLM-L6-v2')
embedding = model.encode('$text').tolist()
print(json.dumps(embedding))
" > "coordination/embeddings/vectors/task-$task_id.json"
done

# Now workers can semantic search
query_similar_tasks "Fix worker launcher bug" 3
```

**Success Metric**: Workers reference relevant past tasks 80% of the time

---

### Phase 3: Fine-Tuning Data Collection (Week 4-6) - LONG TERM

**Goal**: Build training dataset for commit-relay-specific model

**Not Immediate Priority** (Claude doesn't support fine-tuning yet)

**Future Preparation**:
```bash
# coordination/fine-tuning/training-data-collector.sh

collect_successful_patterns() {
    # Collect input-output pairs from successful tasks
    jq -c '.tasks[] | select(.status == "completed" and .success_rate > 0.8)' \
        coordination/task-queue.json | \
    while read task; do
        task_id=$(echo "$task" | jq -r '.id')

        # Input: Task description
        input=$(echo "$task" | jq -r '.description')

        # Output: Final implementation (from worker logs)
        output=$(extract_worker_solution "$task_id")

        # Save training pair
        jq -n --arg input "$input" --arg output "$output" \
            '{input: $input, output: $output}' \
            >> coordination/fine-tuning/training-data/pairs.jsonl
    done
}

# Collect 1000+ examples over time
# Use for few-shot prompting now
# Use for actual fine-tuning later (if Claude supports it)
```

**Alternative**: Use collected examples for **mega few-shot prompting**

---

## Quick Decision Matrix

| Scenario | Use This | Why |
|----------|----------|-----|
| Worker needs recent task results | **RAG** | Changes frequently |
| Worker needs commit-relay conventions | **Fine-tuning** or **Few-shot** | Stable patterns |
| Worker needs better reasoning | **Prompt Engineering** | Activate existing capability |
| Worker needs current system state | **RAG** | Real-time data |
| Worker needs security best practices | **Fine-tuning** or **Few-shot** | Domain expertise |
| Worker needs specific output format | **Prompt Engineering** | Immediate, no cost |
| Worker needs external docs | **RAG** | Outside training data |
| New worker type created | **Prompt Engineering** first | Fast iteration |
| Worker keeps making same mistakes | **Fine-tuning** | Bake in correct pattern |
| Quick experiment/prototype | **Prompt Engineering** | Zero infrastructure |

---

## Real commit-relay Examples

### Example 1: Investigation Task

**Scenario**: "Investigate why 4 governance workers failed at launch"

**Strategy**:

1. **Prompt Engineering** (Chain-of-Thought)
```markdown
# INVESTIGATION PROTOCOL

Step 1: Understand the Symptom
- What failed? (4 governance workers)
- When? (70+ minutes ago)
- Common pattern? (All failed at launch)

Step 2: Gather Evidence
- Check worker spec files
- Check launcher script
- Check worker logs
- Check system logs

Step 3: Form Hypotheses
List 3-5 possible causes:
1. Empty task IDs in worker specs
2. Template injection failure in launcher
3. Permission issues
4. Resource constraints
5. Script syntax errors

Step 4: Test Each Hypothesis
For each, design test and execute

Step 5: Identify Root Cause
Provide evidence-backed conclusion

Step 6: Propose Solution
Include prevention strategy
```

2. **RAG** (Past Similar Issues)
```bash
# Retrieve similar past failures
semantic_search "worker launcher failed empty task context" \
    "task" 3

# Add to prompt:
# SIMILAR PAST ISSUES:
# - task-1762553420: Worker template substitution bug
# - task-1762366073: Empty task_id in worker spec
# - task-1762893199: Launcher script validation failure
```

3. **Result**: Investigation completes in 10 minutes vs 2 hours

---

### Example 2: Code Quality Task

**Scenario**: "Fix code quality issues in commit ${HASH}"

**Strategy**:

1. **Prompt Engineering** (Specific Instructions)
```markdown
You are a code quality expert for bash projects.

# FIX THESE ISSUES:
{{CODE_QUALITY_REPORT}}

# COMMIT-RELAY STANDARDS:
- set -euo pipefail required
- All variables quoted
- JSON validated before write
- Error messages logged
- Functions documented

# OUTPUT:
For each file:
1. Issues found
2. Fixes applied
3. Before/after snippets
4. Test commands
```

2. **RAG** (Code Patterns)
```bash
# Retrieve similar fixes from past
semantic_search "fix bash code quality unquoted variables" \
    "code_pattern" 5

# Examples show correct patterns:
# - scripts/foo.sh: "$VAR" not $VAR
# - coordination/bar.sh: set -euo pipefail at line 3
```

3. **Fine-Tuning Alternative** (Few-Shot Examples)
```markdown
# EXAMPLE FIXES:

## Issue: Missing error handling
Before:
```bash
#!/bin/bash
some_command
```

After:
```bash
#!/bin/bash
set -euo pipefail

some_command || {
    echo "ERROR: some_command failed" >&2
    exit 1
}
```

## Issue: Unquoted variable
Before: `rm -rf $DIR/*`
After: `rm -rf "$DIR"/*`
```

4. **Result**: Code quality issues fixed correctly 95% of the time

---

### Example 3: New Feature Implementation

**Scenario**: "Implement multi-lane task queue"

**Strategy**:

1. **Prompt Engineering** (Structured Approach)
```markdown
# FEATURE: Multi-Lane Task Queue

# REQUIREMENTS:
{{TASK_DESCRIPTION}}

# IMPLEMENTATION STEPS:
1. Research: Review existing queue implementation
2. Design: Plan lane structure (high/medium/low priority)
3. Implement: Update queue logic
4. Test: Verify lane isolation
5. Document: Update README

# CONSTRAINTS:
- Must maintain backwards compatibility
- Existing tasks continue to work
- No breaking changes to worker spawner

# DELIVERABLES:
- coordination/task-queue-lanes.sh
- Updated coordination/task-queue.json schema
- Migration script for existing tasks
- Test suite
```

2. **RAG** (Similar Past Features)
```bash
# Find similar architecture changes
semantic_search "implement queue architecture change" "task" 5

# Learn from:
# - How pool capacity was increased
# - How MoE routing was added
# - How worker types were expanded
```

3. **Result**: Feature implemented following established patterns

---

## Catastrophic Forgetting - What to Watch For

**From PDF**: "Risk of catastrophic forgetting - when the model loses some of its general capabilities while learning specialized ones."

**commit-relay Context**: If we fine-tune Claude on commit-relay patterns, it might forget general bash knowledge.

**Mitigation**:
1. **Don't fine-tune Claude directly** (we don't have access anyway)
2. **Use mega few-shot prompting instead**
3. **Keep examples diverse** (not just commit-relay specific)
4. **Test general capabilities** after adding new examples

**Example Test**:
```bash
# Test that worker still knows general bash after heavy commit-relay training
test_general_knowledge() {
    # General bash question
    echo "Write a function to check if a file exists"

    # Should still work, not just commit-relay patterns
    # If it only knows commit-relay jq commands, we've overfit
}
```

---

## Cost-Benefit Analysis

### Prompt Engineering

**Costs**:
- Developer time to craft prompts: 2-4 hours per worker type
- Testing iterations: 1-2 hours

**Benefits**:
- Immediate 20-40% improvement
- Zero infrastructure cost
- Zero ongoing cost
- Transferable to new Claude versions

**ROI**: Extremely High (implement first)

---

### RAG

**Costs**:
- Initial setup: 1 week
- Vector DB storage: ~100MB for 1000 tasks
- Embedding generation: $0.0001 per task
- Query latency: +200-500ms per task

**Benefits**:
- Workers learn from past successes
- Up-to-date information always
- Easy to add new knowledge
- Prevents repeating solved problems

**ROI**: High (implement second)

---

### Fine-Tuning

**Costs**:
- Training data collection: 4-6 weeks
- Training compute: $500-2000 (if available)
- Retraining for updates: Ongoing
- Risk of catastrophic forgetting: High

**Benefits**:
- Deep domain expertise
- Fastest inference
- No vector DB needed
- Consistent behavior

**ROI**: Medium-Low for commit-relay (Claude doesn't support, use few-shot instead)

---

## Recommended Implementation Order

### Week 1: Prompt Engineering Blitz
- Upgrade all worker prompts
- Add role definitions
- Add structured outputs
- Add reasoning guidance
- **Expected Improvement**: 30% better completions

### Week 2-3: RAG Foundation
- Implement vector store
- Index completed tasks
- Index code patterns
- Add semantic search to workers
- **Expected Improvement**: 50% fewer repeated mistakes

### Week 4+: Training Data Collection
- Collect successful examples
- Build few-shot library
- Create pattern database
- **Expected Improvement**: 70% consistency across workers

### Ongoing: Combination Strategy
- New worker? Start with prompt engineering
- Worker failing? Check RAG retrieval
- Repeated pattern? Add to few-shot examples
- **Expected Improvement**: 90% autonomous success rate

---

## Monitoring & Validation

### Track Effectiveness by Technique

```bash
# coordination/analytics/optimization-impact.sh

record_technique_usage() {
    local task_id="$1"
    local techniques_used="$2"  # "RAG,Prompt,FewShot"
    local success="$3"          # true/false

    jq -n \
        --arg tid "$task_id" \
        --arg tech "$techniques_used" \
        --arg success "$success" \
        '{
            task_id: $tid,
            techniques: ($tech | split(",")),
            success: ($success == "true"),
            timestamp: (now | todate)
        }' >> coordination/analytics/technique-impact.jsonl
}

# Analyze which combinations work best
analyze_technique_combinations() {
    cat coordination/analytics/technique-impact.jsonl | \
    jq -s 'group_by(.techniques | sort | join(",")) |
        map({
            combination: .[0].techniques | sort | join(","),
            total: length,
            success_rate: (map(select(.success)) | length / length),
            sample_tasks: [.[].task_id] | .[0:3]
        }) |
        sort_by(-.success_rate)'
}

# Example output:
# {
#   "combination": "Prompt,RAG",
#   "total": 45,
#   "success_rate": 0.89,
#   "sample_tasks": ["task-123", "task-456", "task-789"]
# }
```

### A/B Testing

```bash
# Test prompt improvements
test_prompt_variant() {
    local task_description="$1"
    local variant_a="basic"
    local variant_b="engineered"

    # Run same task with both prompts
    result_a=$(run_with_prompt "$task_description" "$variant_a")
    result_b=$(run_with_prompt "$task_description" "$variant_b")

    # Compare results
    echo "Variant A (basic): $(evaluate_quality "$result_a")"
    echo "Variant B (engineered): $(evaluate_quality "$result_b")"
}
```

---

## Key Takeaways

1. **Start with Prompt Engineering**
   - Zero cost, immediate results
   - Improves all three techniques when combined

2. **Add RAG for Dynamic Knowledge**
   - Past tasks, current state, external docs
   - Easy to maintain and update

3. **Use Few-Shot Instead of Fine-Tuning**
   - Claude doesn't support fine-tuning yet
   - Few-shot prompting gets 80% of the benefit
   - Collect examples for future fine-tuning

4. **Combine All Three**
   - Prompt engineering for structure
   - RAG for knowledge
   - Few-shot for patterns
   - = Maximum effectiveness

5. **Measure Everything**
   - Track which techniques work
   - A/B test prompt variants
   - Optimize based on data

---

## Quote to Remember

**Martin Keen**: "Basically, it comes down to picking the methods that work for you."

For commit-relay:
- **Prompt Engineering**: Works for structure and reasoning
- **RAG**: Works for knowledge and context
- **Few-Shot**: Works for patterns and conventions
- **All Three**: Works best together

---

**END OF STRATEGY GUIDE**

Generated: 2025-11-14
PDF: RAG vs Fine-Tuning vs Prompt Engineering: Optimizing AI Models.pdf
Pages: 4 (concise and practical)
Implementation Priority: IMMEDIATE (Week 1 starts now)
