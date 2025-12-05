# Cortex TUI (Terminal User Interface)

Terminal-based interfaces for interacting with the Cortex multi-agent system.

## Features

### 1. Dashboard (`tui/dashboard.js`)

Real-time ASCII dashboard showing system state:

- **Worker Pool**: Active workers, status breakdown, recent workers
- **Token Budget**: Total/allocated/available tokens with visual progress bar
- **Task Queue**: Task counts by status
- **Master Agents**: Status of all 5 masters (Coordinator, Security, Development, Inventory, CI/CD)
- **Recent Events**: Live event stream from the system

**Auto-refresh**: Updates every 2 seconds

**Launch:**
```bash
./scripts/cortex-cli.sh dashboard
# or directly:
node tui/dashboard.js
```

**Controls:**
- `Ctrl+C` - Exit

### 2. Chat Interface (`tui/chat.js`)

Conversational interface for task management with minimal controls:

**Commands:**
- `status <task_id>` - Show detailed task status
- `list [filter]` - List recent tasks
- `workers` - Show active worker pool
- `budget` - Show token budget usage
- `help` - Show available commands
- `clear` - Clear screen
- `exit` - Quit chat

**Natural Language:**
Just type what you want to do:
- "Scan repository for security vulnerabilities"
- "Fix bug in authentication module"
- "Document the API endpoints"

The system will:
1. Classify your request using NLP
2. Route to the appropriate master using MoE
3. Create and track the task
4. Provide a task ID for status checking

**Launch:**
```bash
./scripts/cortex-cli.sh chat
# or directly:
node tui/chat.js
```

**Controls:**
- Type and press Enter
- `exit` or `Ctrl+C` - Quit

## Architecture

Both TUIs are built with:
- **Node.js** - Cross-platform runtime
- **Pure ANSI escape codes** - No external dependencies (blessed/ink not needed)
- **File-based coordination** - Read from Cortex coordination files
- **Minimal overhead** - Lightweight and fast

## Integration

Both TUIs are integrated into `cortex-cli.sh`:

```bash
cortex dashboard    # Launch dashboard
cortex chat         # Start chat interface
```

## Requirements

- Node.js v14+ (v22.17.0 tested)
- Terminal with ANSI color support
- Cortex coordination files in `coordination/`

## File Paths Used

**Dashboard:**
- `coordination/worker-pool.json` - Worker status
- `coordination/token-budget.json` - Budget tracking
- `coordination/task-queue.json` - Task queue
- `coordination/dashboard-events.jsonl` - Event stream

**Chat:**
- `coordination/tasks/*.json` - Task files
- `coordination/worker-specs/active/*.json` - Worker specs
- `coordination/masters/coordinator/lib/nlp-classifier.sh` - NLP classification
- `coordination/masters/coordinator/lib/moe-router.sh` - Task routing
- `scripts/spawn-worker.sh` - Worker spawning

## Development

Both scripts are standalone Node.js modules:

```javascript
// Use in other scripts
const CortexDashboard = require('./tui/dashboard');
const dashboard = new CortexDashboard();
dashboard.start();

const CortexChat = require('./tui/chat');
const chat = new CortexChat();
chat.start();
```

## Future Enhancements

Potential additions:
- Interactive task creation wizard in chat
- Filtering/sorting in dashboard
- Worker log streaming
- Token usage graphs
- Task dependency visualization
- Keyboard shortcuts for common actions
- Split-screen mode (dashboard + chat)
