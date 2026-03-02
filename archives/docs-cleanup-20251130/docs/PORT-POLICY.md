# Port Assignment Policy

## CRITICAL RULE

**Cortex must NEVER assign ports or create portals without explicit human approval.**

📋 **See [PORTS-REGISTRY.md](./PORTS-REGISTRY.md) for the complete list of all Cortex ports.**

## Why This Policy Exists

Port conflicts with other applications can cause:
- Service disruptions
- Data loss
- Security vulnerabilities
- System instability

## Current Port Assignments

### Cortex API Dashboard
- **Port**: 9000
- **Service**: Cortex API Server / Dashboard
- **Configuration**: `.env` file (`API_PORT=9000`)
- **Status**: ✅ Active

### Port Change History
- **2025-11-27**: Moved from port 5001 → 9000 (conflict with other apps)

## Governance Enforcement

The governance layer (`scripts/lib/governance-enforcement.sh`) blocks any task that includes:

### Blocked Keywords
- "assign port"
- "create portal"
- "port:"
- "listen on"
- "app.listen"
- "start server"
- "expose port"

### How to Request Port Changes

1. **Create Critical Task Approval**:
   ```bash
   source scripts/lib/governance-enforcement.sh
   approve_critical_task "your-task-id" "your-username"
   ```

2. **Document the Change**:
   - **REQUIRED**: Update `docs/PORTS-REGISTRY.md` (add to Active Ports and Change History)
   - Update this file with the new port assignment
   - Update `.env` file
   - Update any documentation referencing the old port

3. **Test Before Deploying**:
   ```bash
   # Check if port is available
   lsof -i :PORT_NUMBER

   # If empty, port is available
   # If output shows a process, choose a different port
   ```

4. **Common Safe Ports** (less likely to conflict):
   - 8000-8999 (development servers)
   - 9000-9999 (application servers)
   - Avoid: 3000, 5000, 5001, 8080 (commonly used)

## Checking Current Port Usage

### All Listening Ports
```bash
lsof -iTCP -sTCP:LISTEN | grep node
```

### Specific Port
```bash
lsof -i :9000
```

### Cortex Ports Only
```bash
ps aux | grep "node.*server/index.js"
lsof -iTCP -sTCP:LISTEN | grep <PID>
```

## Emergency Port Change Procedure

If Cortex conflicts with another critical service:

1. **Stop Cortex Immediately**:
   ```bash
   pkill -f "node server/index.js"
   ```

2. **Find Available Port**:
   ```bash
   # Test ports 9000-9010
   for port in {9000..9010}; do
     if ! lsof -i :$port > /dev/null 2>&1; then
       echo "Port $port is available"
       break
     fi
   done
   ```

3. **Update Configuration**:
   ```bash
   # Edit .env file
   nano .env
   # Change API_PORT=9000 to new port

   # Restart dashboard
   cd api-server && npm start &
   ```

4. **Document Change**:
   - Update this file
   - Update QUICK-START.md
   - Commit changes with clear message

## API Endpoint After Port Change

After changing the port, update all API calls:

**Old**:
```bash
curl http://localhost:5001/api/health
```

**New**:
```bash
curl http://localhost:9000/api/health
```

## Development Best Practices

### DO NOT:
- ❌ Hardcode port numbers in scripts
- ❌ Assume port 3000 or 5000 is available
- ❌ Start services without checking port availability
- ❌ Change ports without updating documentation

### DO:
- ✅ Use environment variables for port configuration
- ✅ Check port availability before starting services
- ✅ Document all port assignments
- ✅ Test after port changes
- ✅ Get approval for port changes via governance system

## Troubleshooting

### "Port already in use" Error

```bash
# Find what's using the port
lsof -i :9000

# Kill the process (if it's safe to do so)
kill -9 <PID>

# Or choose a different port
```

### Dashboard Won't Start

```bash
# Check logs
tail -f /tmp/cortex-dashboard.log

# Verify .env configuration
cat .env | grep PORT

# Test port availability
lsof -i :$(cat .env | grep API_PORT | cut -d'=' -f2)
```

### Governance Blocking Port Assignment

If governance blocks a legitimate port change:

1. Approve the task as critical:
   ```bash
   source scripts/lib/governance-enforcement.sh
   approve_critical_task "task-id" "your-username"
   ```

2. Or use governance bypass (emergency only):
   ```bash
   export GOVERNANCE_BYPASS=true
   # Run your command
   unset GOVERNANCE_BYPASS
   ```

## Summary

**Remember**: Ports are system resources. Always check availability, get approval, and document changes. Cortex will enforce this policy through governance to prevent conflicts.
