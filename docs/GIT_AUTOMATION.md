# Git Automation Guide

Autonomous git workflow for commit-relay workers.

## Overview

The commit-relay system includes **fully automated git workflows** that eliminate manual intervention. When workers complete tasks, they automatically:

1. ✅ Stage changed files (`git add`)
2. ✅ Create descriptive commits with conventional commit format
3. ✅ Push to GitHub (`git push origin main`)
4. ✅ Record operations for dashboard tracking
5. ✅ Hand off to CI/CD master for post-deployment tasks

## Architecture

```
Worker Completes Task
         ↓
Worker Completion Hook
         ↓
Git Automation Library
         ↓
├─→ Validate Changes
├─→ Check Sensitive Files
├─→ Smart Git Add
├─→ Generate Commit Message
├─→ Create Commit
├─→ Push to Remote
└─→ Record Operation
         ↓
Update Worker Status
         ↓
Optional: Handoff to CI/CD
```

## Usage

### Option 1: Use Worker Completion Hook (Recommended)

```bash
# In your worker script, source the completion hook at the end

#!/bin/bash
set -euo pipefail

# Worker setup
export WORKER_ID="my-worker-001"
export WORKER_TYPE="implementation-worker"
export TASK_ID="task-123"
export TASK_DESCRIPTION="Add new dashboard feature"

# Specify files you changed (optional - defaults to all changes)
export FILES_CHANGED="dashboard/server/index.js dashboard/public/index.html"

# ... do your work here ...

# Automatic git workflow on completion
source "$COMMIT_RELAY_HOME/scripts/templates/worker-completion-hook.sh"
```

### Option 2: Direct Library Usage

```bash
#!/bin/bash
source scripts/lib/git-automation.sh

# Manual git automation
auto_commit_worker_changes \
    "implementation-worker" \
    "task-123" \
    "Add new dashboard feature" \
    "dashboard/server/index.js" \
    "dashboard/public/index.html"
```

## Commit Message Format

The system generates **conventional commit messages** automatically:

```
<type>: <description>

Task: <task-id>
Worker: <worker-type> (<file-count> files)
Autonomous: commit-relay CI/CD

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Commit Types (Auto-Detected)

| Worker Type | Commit Type | Example |
|-------------|-------------|---------|
| `implementation-worker` | `feat` | feat: Add dashboard analytics |
| `fix-worker` | `fix` | fix: Resolve token calculation bug |
| `test-worker` | `test` | test: Add integration tests |
| `documentation-worker` | `docs` | docs: Update API documentation |
| `security-*-worker` | `security` | security: Patch CVE-2025-123 |
| `refactor-worker` | `refactor` | refactor: Optimize worker pool |
| `build-worker` | `build` | build: Update webpack config |

## Safety Features

### Sensitive File Detection

Automatically blocks commits containing:
- `.env` files
- `credentials`, `secrets`
- Private keys (`*.pem`, `*.key`, `id_rsa`)
- Passwords or API keys

```bash
# Example: Blocked
FILES_CHANGED=".env database/credentials.json"
auto_commit_worker_changes ...  # ❌ ERROR: Sensitive files detected
```

### Validation Checks

Before committing, the system validates:
- ✅ In a valid git repository
- ✅ Changes actually exist
- ✅ No sensitive files
- ✅ Files respect `.gitignore`

### Smart File Adding

The `smart_git_add` function:
- Respects `.gitignore` patterns
- Adds only specified files if provided
- Falls back to `git add -A` if no patterns match
- Handles glob patterns correctly

## Configuration

### Environment Variables

```bash
# Skip git automation for testing
export SKIP_GIT_AUTO=true

# Custom commit description
export COMMIT_DESCRIPTION="Custom commit message"

# Specify exact files to commit
export FILES_CHANGED="file1.js file2.js"
```

### Worker Spec Integration

Worker specs automatically track git workflow status:

```json
{
  "worker_id": "impl-worker-001",
  "status": "completed",
  "git_workflow": {
    "status": "success",
    "commit_hash": "a1b2c3d",
    "automated": true
  }
}
```

## Git Operations Log

All git operations are recorded in `coordination/git-operations.jsonl`:

```json
{
  "timestamp": "2025-11-04T19:45:00Z",
  "worker_id": "impl-worker-001",
  "operation": "auto_commit_push",
  "status": "success",
  "details": "Commit: a1b2c3d"
}
```

## Pull Request Creation

For larger changes, workers can create PRs automatically:

```bash
source scripts/lib/git-automation.sh

# Create PR (requires gh CLI)
auto_create_pr \
    "feat: Add new dashboard analytics" \
    "## Summary\n- Added analytics view\n- Real-time metrics\n\n🤖 Generated with Claude Code" \
    "main"
```

## Dashboard Integration

Git operations appear in the dashboard:

- **Real-time Events Feed**: Shows commits and pushes
- **Worker Details**: Displays commit hash and status
- **Git Operations Log**: Dedicated view for all git activity

## CI/CD Master Orchestration

The CI/CD master coordinates multi-file commits:

```
Development Master completes task
         ↓
Worker pushes individual changes
         ↓
Handoff to CI/CD Master
         ↓
CI/CD verifies all changes pushed
         ↓
Creates consolidated PR (if needed)
         ↓
Updates dashboard
         ↓
Notifies coordinator
```

## Troubleshooting

### Issue: "ERROR: Not in a git repository"

**Solution**: Ensure `COMMIT_RELAY_HOME` is set correctly and points to a git repo.

### Issue: "No changes to commit"

**Cause**: Worker didn't modify any files or changes were already committed.

**Solution**: Verify your worker actually creates/modifies files.

### Issue: "Sensitive files detected"

**Cause**: Attempting to commit `.env`, credentials, or private keys.

**Solution**: Remove sensitive files from `FILES_CHANGED` or add to `.gitignore`.

### Issue: "Failed to push to remote"

**Possible causes**:
- No network connection
- Authentication failed
- Branch protection rules
- Merge conflicts

**Solution**: Check network, git credentials, and repo permissions.

## Best Practices

1. **Specify Files Explicitly**: Better control over what gets committed
   ```bash
   export FILES_CHANGED="src/feature.js tests/feature.test.js"
   ```

2. **Descriptive Task Descriptions**: Used in commit messages
   ```bash
   export TASK_DESCRIPTION="Add real-time WebSocket support for dashboard"
   ```

3. **Test Without Git**: Use `SKIP_GIT_AUTO=true` during development
   ```bash
   SKIP_GIT_AUTO=true ./my-worker.sh
   ```

4. **Review Logs**: Check `coordination/git-operations.jsonl` for audit trail

5. **Use Worker Completion Hook**: Standardizes git workflow across all workers

## Example: Complete Worker

```bash
#!/bin/bash
# workers/example-automated-worker.sh
set -euo pipefail

# === Configuration ===
export WORKER_ID="example-$(date +%s)"
export WORKER_TYPE="implementation-worker"
export TASK_ID="${TASK_ID:-task-999}"
export TASK_DESCRIPTION="Example automated worker with git"
export COMMIT_RELAY_HOME="$(cd "$(dirname "$0")/.." && pwd)"

echo "Starting automated worker: $WORKER_ID"

# === Do Work ===
cd "$COMMIT_RELAY_HOME"

# Make some changes
echo "// New feature added by $WORKER_ID" >> src/example.js
echo "describe('example tests', () => {})" > tests/example.test.js

# Track what you changed
export FILES_CHANGED="src/example.js tests/example.test.js"

echo "Work completed!"

# === Automatic Git Workflow ===
source "$COMMIT_RELAY_HOME/scripts/templates/worker-completion-hook.sh"
# ^ This handles everything: git add, commit, push, status update
```

## Advanced: Custom Git Workflows

For complex scenarios, extend the git automation library:

```bash
# Custom function in your worker
custom_git_workflow() {
    source scripts/lib/git-automation.sh

    # Create feature branch
    git checkout -b "feature/$TASK_ID"

    # Commit changes
    auto_commit_worker_changes "$WORKER_TYPE" "$TASK_ID" "$TASK_DESCRIPTION"

    # Create PR instead of pushing to main
    auto_create_pr \
        "feat: $TASK_DESCRIPTION" \
        "Automated implementation for $TASK_ID" \
        "main"
}
```

## Security Considerations

- ✅ All commits are signed with worker identification
- ✅ Sensitive file detection prevents credential leaks
- ✅ Operations logged for audit trail
- ✅ Git credentials should use SSH keys or tokens (not passwords)
- ✅ Worker execution isolated to specific directories

## Future Enhancements

Planned features:
- [ ] Automatic branch strategy selection (feature/* vs direct to main)
- [ ] Conflict detection and auto-resolution
- [ ] Multi-repository coordination
- [ ] Signed commits with GPG
- [ ] Pre-commit hooks integration
- [ ] Automatic changelog generation

---

**🤖 Generated with commit-relay autonomous CI/CD system**
