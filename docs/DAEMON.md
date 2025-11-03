# Worker Daemon

The commit-relay worker daemon automatically monitors for pending workers and launches them in new Claude Code sessions without any manual intervention.

## Features

- ✅ Automatic worker detection and launching
- ✅ Runs as macOS LaunchAgent (starts on login)
- ✅ Self-healing (auto-restart on crash)
- ✅ Monitors coordination state every 30 seconds
- ✅ Launches workers in new Terminal tabs
- ✅ Comprehensive logging and status monitoring

---

## Quick Start

### Install (One-Time Setup)

```bash
cd ~/commit-relay
./scripts/daemon-control.sh install
```

That's it! The daemon will now:
- Start automatically when you log in
- Monitor for pending workers every 30 seconds
- Launch workers automatically in new Terminal tabs
- Restart automatically if it crashes

### Check Status

```bash
./scripts/daemon-control.sh status
```

### View Live Logs

```bash
./scripts/daemon-control.sh logs
```

---

## Usage

### Commands

```bash
# Install as LaunchAgent (auto-start on login)
./scripts/daemon-control.sh install

# Start daemon manually
./scripts/daemon-control.sh start

# Stop daemon
./scripts/daemon-control.sh stop

# Restart daemon
./scripts/daemon-control.sh restart

# Show status and recent logs
./scripts/daemon-control.sh status

# Tail log file
./scripts/daemon-control.sh logs

# Uninstall LaunchAgent
./scripts/daemon-control.sh uninstall
```

---

## How It Works

### Monitoring Loop

Every 30 seconds, the daemon:
1. Pulls latest coordination state from GitHub
2. Checks `coordination/worker-specs/active/` for pending workers
3. For each pending worker:
   - Updates status to "running"
   - Launches Claude Code in new Terminal tab with worker prompt
   - Broadcasts "worker_started" event to dashboard
   - Commits and pushes status change

### Worker Tracking

The daemon uses file-based tracking (`/tmp/commit-relay-workers/`) to avoid launching the same worker multiple times. When a worker moves to `completed/`, the tracking file is removed.

### Automatic Startup

When installed as a LaunchAgent, macOS automatically:
- Starts the daemon on login
- Restarts it if it crashes
- Throttles restarts (30s minimum between restarts)

---

## Configuration

### Poll Interval

Default: 30 seconds

To change, set environment variable before starting:

```bash
export WORKER_DAEMON_POLL_INTERVAL=60  # Check every 60 seconds
./scripts/daemon-control.sh restart
```

### Log Location

- **Log File**: `agents/logs/system/worker-daemon.log`
- **PID File**: `/tmp/commit-relay-worker-daemon.pid`
- **LaunchAgent**: `~/Library/LaunchAgents/com.ryops.commit-relay.worker-daemon.plist`

---

## Troubleshooting

### Daemon Not Starting

Check the logs:
```bash
tail -f ~/commit-relay/agents/logs/system/worker-daemon.log
```

Common issues:
- Git authentication failure (check SSH keys)
- Missing dependencies (jq, osascript)
- Permission issues on coordination files

### Workers Not Launching

Verify:
1. Daemon is running: `./scripts/daemon-control.sh status`
2. Pending workers exist: `ls coordination/worker-specs/active/`
3. Check logs for errors: `./scripts/daemon-control.sh logs`

### Multiple Workers Launching

The daemon uses file-based tracking to prevent duplicates. If you see duplicates:
```bash
# Clean tracking directory
rm -rf /tmp/commit-relay-workers/*

# Restart daemon
./scripts/daemon-control.sh restart
```

---

## Uninstalling

To completely remove the daemon:

```bash
# Uninstall LaunchAgent and stop daemon
./scripts/daemon-control.sh uninstall

# Clean up tracking files
rm -rf /tmp/commit-relay-workers/

# Remove log file (optional)
rm ~/commit-relay/agents/logs/system/worker-daemon.log
```

---

## Integration with Automation Flow

### Master Agents

When master agents spawn workers:
1. Create worker spec in `coordination/worker-specs/active/`
2. Set status to "pending"
3. Commit and push to GitHub

### Daemon

1. Detects new pending worker (within 30 seconds)
2. Launches worker automatically
3. Updates status to "running"

### Workers

1. Execute their assigned task
2. Update results in coordination state
3. Move spec to `coordination/worker-specs/completed/`
4. Daemon cleans up tracking file

---

## Benefits

### Before Daemon

❌ Manual worker startup required
❌ Easy to forget pending workers
❌ Manual monitoring of worker specs
❌ Context switching to check for new workers

### With Daemon

✅ **Zero manual intervention**
✅ **Truly autonomous automation**
✅ **Workers start within 30 seconds**
✅ **Dashboard notifications**
✅ **Auto-recovery from crashes**

---

## Example Workflow

1. **Security Master** spawns `worker-scan-001`
   ```bash
   # Creates: coordination/worker-specs/active/worker-scan-001.json
   # Status: pending
   ```

2. **Daemon** detects pending worker (within 30 seconds)
   ```
   [INFO] Found pending worker: worker-scan-001
   [INFO]   Type: scan-worker
   [INFO]   Task: task-012
   [INFO] Launching worker-scan-001 in new Terminal tab...
   [SUCCESS] Launched worker-scan-001
   ```

3. **Worker** executes in new Claude Code session
   - Reads specification
   - Executes security scan
   - Updates results
   - Moves to completed

4. **Daemon** cleans up tracking
   ```
   [DEBUG] Worker worker-scan-001 completed, removing from tracking
   ```

---

## Architecture

```
┌─────────────────────────────────────────────┐
│         macOS LaunchAgent                    │
│  (Auto-start on login, auto-restart)        │
└────────────┬────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────┐
│       Worker Daemon (worker-daemon.sh)      │
│                                              │
│  ┌────────────────────────────────────┐    │
│  │  Monitoring Loop (every 30s)       │    │
│  │  1. Pull coordination state        │    │
│  │  2. Check for pending workers      │    │
│  │  3. Launch workers automatically   │    │
│  │  4. Update coordination            │    │
│  │  5. Broadcast events              │    │
│  └────────────────────────────────────┘    │
└─────────────┬───────────────────────────────┘
              │
    ┌─────────┴──────────┬──────────────┐
    ▼                    ▼              ▼
┌────────┐          ┌────────┐     ┌────────┐
│Worker  │          │Worker  │     │Worker  │
│  001   │          │  002   │     │  003   │
└────────┘          └────────┘     └────────┘
```

---

## Security Considerations

- Daemon runs with user permissions (not root)
- Logs may contain task details (ensure proper permissions)
- Terminal tabs are visible (workers are not headless)
- GitHub authentication required for coordination sync

---

*Part of the commit-relay autonomous automation system*
