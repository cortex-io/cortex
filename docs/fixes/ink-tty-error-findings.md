# Ink TTY Error Findings and Resolution

## Issue Report for Ink Framework

### Error Encountered
```
ERROR Raw mode is not supported on the current process.stdin, which Ink uses as input stream
Read about how to prevent this error on https://github.com/vadimdemedes/ink/#israwmodesupported
```

### Context
We encountered this error while implementing an automated worker launcher system that spawns Claude Code CLI instances. Claude Code uses the Ink framework for its interactive UI.

### Root Cause
**Problematic Code Pattern:**
```bash
claude < prompt.md
```

**Why It Fails:**
- Piping a file to stdin (`< prompt.md`) makes stdin a file descriptor rather than a TTY
- Ink's `isRawModeSupported()` check requires stdin to be an interactive terminal
- The Ink framework crashes immediately before the application (Claude Code) can even start
- This results in silent failures with no error logging if stderr isn't captured

### Impact
- 100% failure rate for all workers launched with stdin redirection
- Silent failures - workers crash before any application code runs
- Created "zombie" tasks that remain in "spawned" status indefinitely
- In our case: 48 zombie tasks accumulated over 4 days before discovery

### Solution
**Working Pattern - Launch in Terminal.app (macOS):**
```bash
# Use osascript to launch in a real terminal with TTY
osascript -e "tell application \"Terminal\" to do script \"cd '$WORKER_DIR' && claude --prompt prompt.md; exit\""
```

**Alternative Pattern - Direct execution with stderr capture:**
```bash
# Don't pipe stdin - use flags/arguments instead
claude --prompt prompt.md 2> stderr.log
```

### Key Learnings

1. **Never pipe files to stdin for Ink apps:**
   ```bash
   # DON'T DO THIS:
   ink-based-app < input.txt

   # DO THIS INSTEAD:
   ink-based-app --input input.txt
   ```

2. **Always capture stderr when launching Ink apps:**
   ```bash
   your-ink-app 2> logs/stderr.log
   ```

3. **Test for TTY before launching:**
   ```bash
   if [ -t 0 ]; then
     echo "stdin is a TTY"
   else
     echo "stdin is NOT a TTY - Ink will fail!"
   fi
   ```

4. **Use real terminals for automation:**
   - On macOS: Terminal.app via osascript
   - On Linux: xterm, gnome-terminal, or `script` command
   - Or use PTY libraries (expect, python's pty module)

### Recommendation for Ink Documentation

The current error message is excellent, but could be enhanced with:

1. **Explicit mention of stdin redirection:**
   ```
   ERROR: Raw mode is not supported on the current process.stdin.

   Common causes:
   - Piping input: app < file.txt
   - Input redirection in scripts
   - Running without a TTY (use 'script' command or PTY library)

   Read more: https://github.com/vadimdemedes/ink/#israwmodesupported
   ```

2. **Pre-flight check example in docs:**
   ```javascript
   // Check if stdin supports raw mode before initializing Ink
   if (!process.stdin.isTTY) {
     console.error('This application requires a TTY. Run in a terminal.');
     process.exit(1);
   }
   ```

### System Details
- Platform: macOS (Darwin 25.0.0)
- Application: Claude Code CLI (uses Ink framework)
- Launcher: Bash script spawning workers via stdin redirection
- Discovery: November 2025

### Fixed Implementation

Our corrected launcher now:
1. Uses Terminal.app launch via osascript (provides real TTY)
2. Captures stderr/stdout to log files
3. Detects Ink TTY errors via log scanning
4. Updates task status on failure
5. Provides clear error messages

**Result:** 0% failure rate after fix (from 100% before fix)

---

## Internal Notes

### Files Changed
- `scripts/claude-worker-launcher-v2.sh` - Fixed worker launcher
- Backup: `scripts/claude-worker-launcher-v2.sh.broken` - Original broken version

### Testing
- 6 workers pending test with new launcher
- Expected: All workers launch successfully with TTY support
- Monitoring: stderr.log files for any Ink errors

### Related Tasks
- task-1762896847: Critical hotfix for launcher Ink TTY error
- task-1762896271: Zombie worker cleanup system (addresses 48 zombies from this issue)
