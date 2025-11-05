# Known Issues - Coordination Files

## Duplicate Task IDs in task-queue.json

**Issue**: The task-queue.json file contains duplicate task IDs, which breaks Alpine.js rendering on the dashboard.

**Evidence**:
- 4 tasks with ID "task-012"
- 2 tasks with empty ID ""

**Impact**: 
- Alpine.js x-for requires unique :key values
- Duplicate keys cause "Alpine Warning: Duplicate key on x-for" errors
- Results in "Cannot read properties of undefined (reading 'after')" crash
- Dashboard fails to render task table

**Workaround**:
- Dashboard now uses array index as key instead of task.id
- See dashboard/public/index.html line 449: `:key="'task-' + index"`

**Root Cause**:
- scripts/create-task.sh has a bug generating task IDs
- Line 147: octal number error with leading zeros (e.g., "019")
- Some tasks created without proper ID assignment

**TODO**:
1. Fix create-task.sh to generate unique IDs correctly
2. Clean up task-queue.json to remove duplicates
3. Add validation to prevent duplicate IDs from being created
4. Consider using UUID instead of sequential IDs

**History**:
- First encountered: 2025-11-05
- Workaround added: commit f5b089f
- This issue has occurred before (per user feedback)
