# Anthropic Autonomous Coding Quickstart Analysis

**Source:** https://github.com/anthropics/claude-quickstarts/tree/main/autonomous-coding
**Date Analyzed:** 2025-12-04

## Overview

Official Anthropic quickstart demonstrating a **two-agent pattern** for long-running autonomous development. The system uses an initializer agent followed by continuation agents across multiple sessions, enabling building complete applications over extended periods.

---

## Architecture

### Core Components

| File | Purpose |
|------|---------|
| `autonomous_agent_demo.py` | Main entry point orchestrating sessions |
| `agent.py` | Core agent session logic |
| `client.py` | Claude SDK configuration |
| `security.py` | Command allowlist enforcement |
| `progress.py` | Session progress tracking |
| `prompts.py` | Prompt management |

---

## Two-Phase Approach

### Phase 1: Initializer (Session 1)

**Responsibilities:**
- Read application specification
- Generate 200 test cases in `feature_list.json`
- Establish project structure
- Initialize git repository
- Create baseline commit

**Key Output:** Structured feature list with all tests marked as "failing"

### Phase 2: Coding Agent (Sessions 2+)

**Responsibilities:**
- Implement features incrementally
- Mark completions in persistent JSON
- Maintain context across restarts
- Commit progress to git

**Session Duration:** 5-15 minutes per iteration for substantial applications

---

## Session Management

### Progress Persistence

The system maintains progress through **file-based state**:

1. **Feature list** (`feature_list.json`): Tracks which tests pass/fail
2. **Git commits**: Provides code history
3. **Progress files**: Documents session context

This allows agents to resume after interruption with fresh context while leveraging previous work.

### Startup Sequence

Each session:
1. Loads feature list
2. Reviews git history
3. Selects highest-priority failing test
4. Implements feature
5. Runs tests
6. Updates feature list
7. Commits changes

---

## Security Model

### Defense-in-Depth Approach

**Layer 1: OS-Level Sandboxing**
- Bash execution runs in restricted environment
- Prevents system-level attacks

**Layer 2: Filesystem Restrictions**
- Operations limited to project directory only
- Cannot access parent directories or system files

**Layer 3: Command Allowlist**
- Only approved bash commands permitted
- Includes: file inspection, git, npm, selective process management
- Blocks: network access, system modification, privilege escalation

### Security Configuration

From `security.py`:
- Allowlist enforcement for all bash commands
- Filesystem path validation
- Resource limits on command execution

---

## Feature List Pattern

### Structure

```json
{
  "features": [
    {
      "id": "feature-001",
      "description": "User can register with email/password",
      "status": "failing",
      "test_command": "npm test -- user-registration.test.js",
      "priority": "high"
    },
    {
      "id": "feature-002",
      "description": "Password must meet complexity requirements",
      "status": "failing",
      "test_command": "npm test -- password-validation.test.js",
      "priority": "medium"
    }
  ]
}
```

### Granularity Guidelines

**200 test cases** for substantial applications ensures:
- Agents focus on one atomic unit per session
- Prevents skipping implementation details
- Forces comprehensive coverage
- Provides clear completion criteria

---

## Best Practices Demonstrated

### 1. Session Isolation
Each agent run operates with fresh context, preventing context window bloat over time.

### 2. Incremental Progress
Single-feature focus per session keeps work manageable and verifiable.

### 3. Test-Driven Development
Feature list forces test-first approach:
- Tests written upfront
- Implementation follows
- Completion requires passing tests

### 4. Git Integration
Automatic commits provide:
- Code history
- Rollback capability
- Session boundaries
- Progress visualization

### 5. Explicit Specifications
Application spec defines complete requirements before any code is written.

---

## Timing Expectations

**From source documentation:**
- Initial setup: ~5 minutes
- Feature implementation: 5-15 minutes per iteration
- Full application: Multiple hours to days depending on complexity

**Token Budget Considerations:**
- Each session consumes 20-40K tokens
- 200 features × 30K avg = ~6M tokens for complete app
- Requires multi-session approach with breaks

---

## Applicability to Cortex

### Strong Alignment

✅ **Multi-session architecture**: Cortex already uses persistent workers
✅ **File-based state**: `coordination/*.json` files track progress
✅ **Git integration**: Workers operate on repositories
✅ **Security restrictions**: Governance framework limits operations
✅ **Incremental progress**: Task queue enables step-by-step work

### Key Differences

| Aspect | Quickstart | Cortex |
|--------|-----------|--------|
| Agent count | 2 (init + coding) | 5 masters + 7 worker types |
| Feature tracking | Single JSON file | Distributed coordination files |
| Security | Allowlist only | Allowlist + governance + audit logs |
| Scope | Single application | Multi-repo portfolio |
| Testing | Mandatory per feature | Optional (should be mandatory) |

---

## Recommendations for Cortex

### 1. Adopt Feature List Pattern

Create `coordination/feature-lists/{task-id}.json` for each major task:

```json
{
  "task_id": "implement-oauth",
  "total_features": 47,
  "completed": 12,
  "features": [
    {
      "feature_id": "oauth-001",
      "description": "OAuth client registration endpoint",
      "status": "passing",
      "implemented_by": "worker-implementation-003",
      "test_results": {
        "command": "npm test oauth-client.test.js",
        "exit_code": 0,
        "output": "12 passing"
      }
    }
  ]
}
```

### 2. Enforce Test-First Development

Update master agents to:
1. Generate comprehensive test list before spawning implementation workers
2. Require test execution before marking tasks complete
3. Block completion if tests fail

### 3. Implement Quickstart Security Model

Enhance `lib/governance/access-control.js` with:
- Command allowlist (currently using approval lists, could be stricter)
- Filesystem path restrictions (limit workers to specific directories)
- Resource limits per worker

### 4. Add Session Timing Metrics

Track in `coordination/worker-pool.json`:
```json
{
  "worker_id": "worker-implementation-001",
  "session_duration_minutes": 12,
  "features_completed": 3,
  "avg_time_per_feature": 4
}
```

### 5. Create Initializer Master

Add new master type: `initializer-master` that:
- Reads task specifications
- Generates feature lists (200+ atomic units)
- Sets up project structure
- Creates baseline git commits
- Hands off to development/security/etc. masters

### 6. Standardize Progress Files

Adopt the `progress.py` pattern:
- Each worker maintains `coordination/workers/{worker-id}/progress.txt`
- Documents what was done, current state, next steps
- Enables context continuity across sessions

---

## Implementation Priority

### High Priority
1. **Feature list pattern**: Immediate value for task decomposition
2. **Test-first enforcement**: Prevents incomplete work being marked done
3. **Progress files**: Improves session continuity

### Medium Priority
4. **Initializer master**: Enhances task planning
5. **Session timing metrics**: Improves resource allocation

### Low Priority
6. **Security hardening**: Current governance already strong, incremental improvements

---

## Key Takeaways

1. **200+ atomic features** is the right granularity for complex tasks
2. **Test-first approach** prevents premature completion declarations
3. **File-based state** enables cross-session persistence without context bloat
4. **Command allowlists** provide essential security boundaries
5. **Initializer/Coding split** separates planning from execution effectively

Cortex already implements the multi-session architecture well. The main opportunities are:
- Finer-grained feature decomposition (200+ vs. current task granularity)
- Mandatory test execution before completion
- Explicit progress documentation per worker

---

## Code Example to Adopt

### Feature List Generator (Python)

```python
# Add to coordination/masters/coordinator/lib/feature-decomposer.py

def decompose_task(task_description: str, target_count: int = 200) -> list[dict]:
    """
    Decompose a high-level task into 200+ atomic features.
    Uses Claude to generate granular test cases.
    """
    prompt = f"""
    Decompose this task into {target_count} atomic, testable features:

    Task: {task_description}

    Each feature should:
    - Be independently testable
    - Take 5-15 minutes to implement
    - Have clear success criteria
    - Include test command

    Return JSON array of features.
    """

    response = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}]
    )

    features = json.loads(response.content[0].text)

    # Add metadata
    for i, feature in enumerate(features):
        feature["id"] = f"feature-{i+1:03d}"
        feature["status"] = "failing"
        feature["priority"] = assign_priority(feature)

    return features
```

This pattern could be integrated into the Coordinator master for better task decomposition.
