# Cortex Quick Start

Get Cortex running in 10 minutes.

## Prerequisites

- macOS or Linux
- Node.js 18+
- Python 3.8+
- Git
- API keys (Anthropic Claude)

## 1. Install Dependencies

```bash
# Install Node dependencies for dashboard
cd api-server
npm install
cd ..

# Install Python dependencies (optional, for ML features)
cd python-sdk
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

## 2. Configure Environment

```bash
# Copy example config
cp .env.example .env

# Edit .env and add your API keys
nano .env

# Required:
ANTHROPIC_API_KEY=your-key-here
API_KEY=your-dashboard-api-key

# Optional:
SEMANTIC_ROUTING_ENABLED=false  # Disable ML features for simplicity
PYTORCH_ROUTING_ENABLED=false
```

## 3. Start the Dashboard

```bash
# Start API server
cd api-server
npm start

# Dashboard runs at: http://localhost:3000
```

## 4. Run Your First Task

Create a simple test task:

```bash
# The system should be watching the task queue
# Add a task to coordination/task-queue.json or use the API

curl -X POST http://localhost:3000/api/tasks \
  -H "x-api-key: your-dashboard-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-001",
    "type": "development",
    "description": "Create a simple hello world script at scripts/hello.sh",
    "priority": "medium"
  }'
```

## 5. Monitor Progress

Open http://localhost:3000 in your browser to see:
- Task queue status
- Worker pool
- System health
- Routing decisions

## What's Next?

- **Learn the architecture**: See [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Common operations**: See [docs/RUNBOOKS.md](./docs/RUNBOOKS.md)
- **API reference**: See [docs/API-REFERENCE.md](./docs/API-REFERENCE.md)

## Troubleshooting

### Dashboard won't start
```bash
# Check if port 3000 is in use
lsof -i :3000

# Kill if needed
kill -9 <PID>
```

### Workers not spawning
```bash
# Check worker daemon
./scripts/daemon-control.sh status

# Restart if needed
./scripts/daemon-control.sh restart
```

### Token budget errors
```bash
# Check budget
cat coordination/token-budget.json | jq

# Reset if needed (WARNING: This will reset usage tracking)
echo '{"budget":{"daily":{"limit":270000,"used":0}}}' > coordination/token-budget.json
```

## Minimal Configuration

For the simplest setup (no ML features):

```bash
# .env
ANTHROPIC_API_KEY=your-key
API_KEY=your-dashboard-key
SEMANTIC_ROUTING_ENABLED=false
PYTORCH_ROUTING_ENABLED=false
RAG_ENABLED=false
```

This gives you basic keyword routing without ML overhead.
