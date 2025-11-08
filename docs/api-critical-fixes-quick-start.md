# Critical API Fixes - Quick Start Guide
**Task:** task-1762553438
**Urgency:** IMMEDIATE (Apply within 24 hours)

This guide provides copy-paste ready code for the 6 most critical security fixes. These fixes address vulnerabilities that could lead to complete system compromise.

---

## Prerequisites

```bash
cd /Users/ryandahlberg/projects/commit-relay/dashboard
npm install --save express-rate-limit proper-lockfile
```

---

## Fix #1: Authentication & Authorization (8 hours)

### Step 1: Set Environment Variables

```bash
# Add to .env or export before starting server
export DASHBOARD_API_KEY="your-secure-random-key-here"
export DASHBOARD_WRITE_KEY="your-secure-write-key-here"
export DASHBOARD_ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"
export NODE_ENV="production"
```

### Step 2: Update Middleware (Lines 20-23)

**REPLACE:**
```javascript
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
```

**WITH:**
```javascript
// Authentication middleware
const API_KEY = process.env.DASHBOARD_API_KEY || 'CHANGE_ME_IN_PRODUCTION_OR_SYSTEM_IS_VULNERABLE';
const WRITE_KEY = process.env.DASHBOARD_WRITE_KEY || 'CHANGE_ME_IN_PRODUCTION_OR_SYSTEM_IS_VULNERABLE';

if (API_KEY === 'CHANGE_ME_IN_PRODUCTION_OR_SYSTEM_IS_VULNERABLE') {
  console.error('WARNING: API_KEY not set! Server is vulnerable!');
}

function authenticateRequest(req, res, next) {
  // Allow public access to static files and health check
  if (req.path.startsWith('/api/health') || !req.path.startsWith('/api/')) {
    return next();
  }

  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid API key required. Include X-API-Key header.'
    });
  }

  next();
}

function requireWriteAccess(req, res, next) {
  const dangerousOperations = [
    '/daemon/control',
    '/pm-daemon/control',
    '/health-daemon/control',
    '/metrics-daemon/control',
    '/dashboard-server/control',
    '/event-log/purge',
    '/restart-worker',
    '/repair'
  ];

  if (dangerousOperations.some(path => req.path.includes(path))) {
    const writeKey = req.headers['x-write-key'];
    if (!writeKey || writeKey !== WRITE_KEY) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Write access required. Include X-Write-Key header.'
      });
    }
  }

  next();
}

// CORS configuration - restrict to known origins
const corsOptions = {
  origin: process.env.DASHBOARD_ALLOWED_ORIGINS
    ? process.env.DASHBOARD_ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Write-Key'],
  exposedHeaders: ['X-Total-Count'],
  maxAge: 86400
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(authenticateRequest);
app.use(requireWriteAccess);
app.use(express.static(path.join(__dirname, '../public')));
```

### Step 3: Test Authentication

```bash
# Should fail (no API key)
curl http://localhost:3000/api/metrics

# Should succeed (with API key)
curl -H "X-API-Key: your-secure-random-key-here" http://localhost:3000/api/metrics

# Should fail (needs write key)
curl -X POST -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"action":"start"}' \
  http://localhost:3000/api/daemon/control

# Should succeed (with both keys)
curl -X POST \
  -H "X-API-Key: your-secure-random-key-here" \
  -H "X-Write-Key: your-secure-write-key-here" \
  -H "Content-Type: application/json" \
  -d '{"action":"start"}' \
  http://localhost:3000/api/daemon/control
```

---

## Fix #2: Rate Limiting (3 hours)

### Step 1: Add After Authentication Middleware

**INSERT AFTER LINE 23 (after authenticateRequest and requireWriteAccess):**

```javascript
const rateLimit = require('express-rate-limit');

// General API rate limiting
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiting for expensive/destructive operations
const strictLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 requests per 5 minutes
  message: { error: 'Rate limit exceeded for this operation' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Very strict for DDQD tests
const ddqdLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 tests per hour
  message: { error: 'DDQD test rate limit exceeded. Max 5 tests per hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply to all API routes
app.use('/api/', apiLimiter);

// Apply strict limiting to specific routes
app.use('/api/daemon/control', strictLimiter);
app.use('/api/pm-daemon/control', strictLimiter);
app.use('/api/health-daemon/control', strictLimiter);
app.use('/api/metrics-daemon/control', strictLimiter);
app.use('/api/dashboard-server/control', strictLimiter);
app.use('/api/event-log/purge', strictLimiter);
app.use('/api/health-alerts/:id/restart-worker', strictLimiter);
app.use('/api/health-alerts/:id/repair', strictLimiter);
app.use('/api/ddqd/run', ddqdLimiter);
```

### Step 2: Test Rate Limiting

```bash
# Send 101 requests in a minute - last ones should fail
for i in {1..101}; do
  curl -H "X-API-Key: your-key" http://localhost:3000/api/health
  echo "Request $i"
done

# Should see 429 Too Many Requests after 100 requests
```

---

## Fix #3: Command Injection Prevention (4 hours)

### Step 1: Replace Worker Daemon Control (Lines 1791-1837)

**REPLACE the entire `app.post('/api/daemon/control', ...)` endpoint WITH:**

```javascript
app.post('/api/daemon/control', async (req, res) => {
  const { spawn } = require('child_process');
  const { action } = req.body;

  try {
    // Input validation
    if (!action || !['start', 'stop'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Use "start" or "stop"'
      });
    }

    const scriptPath = path.join(__dirname, '../../scripts/worker-daemon.sh');

    // Verify script exists and is in expected location
    if (!scriptPath.startsWith(path.join(__dirname, '../../scripts/'))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid script path'
      });
    }

    if (!fsSync.existsSync(scriptPath)) {
      return res.status(500).json({
        success: false,
        message: 'Daemon script not found'
      });
    }

    if (action === 'start') {
      const PID_FILE = '/tmp/commit-relay-worker-daemon.pid';
      const fsSync = require('fs');

      if (fsSync.existsSync(PID_FILE)) {
        const pid = parseInt(fsSync.readFileSync(PID_FILE, 'utf-8').trim());
        try {
          process.kill(pid, 0);
          return res.json({
            success: false,
            message: 'Worker daemon is already running',
            pid
          });
        } catch (e) {
          fsSync.unlinkSync(PID_FILE);
        }
      }

      // Use spawn with array args (no shell injection)
      const logFile = fsSync.openSync('/tmp/worker-daemon-start.log', 'a');
      const daemonProcess = spawn('bash', [scriptPath], {
        detached: true,
        stdio: ['ignore', logFile, logFile]
      });

      daemonProcess.unref();
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (fsSync.existsSync(PID_FILE)) {
        const pid = parseInt(fsSync.readFileSync(PID_FILE, 'utf-8').trim());
        res.json({ success: true, message: 'Worker daemon started', pid });
      } else {
        res.json({ success: false, message: 'Worker daemon may have failed to start' });
      }

    } else if (action === 'stop') {
      const stopProcess = spawn('bash', [scriptPath, 'stop'], {
        stdio: 'pipe'
      });

      let completed = false;
      stopProcess.on('close', (code) => {
        if (completed) return;
        completed = true;
        if (code === 0) {
          res.json({ success: true, message: 'Worker daemon stopped' });
        } else {
          res.status(500).json({
            success: false,
            message: 'Failed to stop worker daemon'
          });
        }
      });

      stopProcess.on('error', (error) => {
        if (completed) return;
        completed = true;
        res.status(500).json({ success: false, message: error.message });
      });
    }
  } catch (error) {
    console.error('Error controlling worker daemon:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
```

### Step 2: Apply Same Fix to Other Daemon Endpoints

Apply the same pattern to:
- `/api/pm-daemon/control` (lines 1843-1903)
- `/api/health-daemon/control` (lines 1944-1993)
- `/api/metrics-daemon/control` (lines 2034-2083)

Just replace `worker-daemon` with appropriate daemon name and PID file path.

---

## Fix #4: Path Traversal Protection (2 hours)

### Step 1: Add Safety Helper (Add after imports, around line 40)

```javascript
/**
 * Safely join paths and verify result is within base directory
 * Prevents path traversal attacks
 */
function safePathJoin(baseDir, ...parts) {
  const resultPath = path.join(baseDir, ...parts);
  const normalizedResult = path.normalize(resultPath);
  const normalizedBase = path.normalize(baseDir);

  if (!normalizedResult.startsWith(normalizedBase)) {
    throw new Error('Path traversal detected');
  }

  return normalizedResult;
}

/**
 * Validate worker ID format (alphanumeric, hyphens, underscores only)
 */
function isValidWorkerId(workerId) {
  return /^[a-zA-Z0-9-_]+$/.test(workerId);
}
```

### Step 2: Update Restart Worker Endpoint (Lines 1220-1327)

**FIND the section where workerSpecPath is constructed (around lines 1244-1265):**

```javascript
const workerId = alert.worker_id;
const workerSpecsDir = path.join(__dirname, '../../coordination/worker-specs');
// ...
const stuckPath = path.join(stuckDir, `${workerId}.json`);
const failedPath = path.join(failedDir, `${workerId}.json`);
```

**REPLACE WITH:**

```javascript
const workerId = alert.worker_id;

// Validate worker ID format
if (!workerId || !isValidWorkerId(workerId)) {
  return res.status(400).json({
    error: 'Invalid worker ID format'
  });
}

const workerSpecsDir = path.join(__dirname, '../../coordination/worker-specs');
const stuckDir = path.join(workerSpecsDir, 'stuck');
const failedDir = path.join(workerSpecsDir, 'failed');
const activeDir = path.join(workerSpecsDir, 'active');

let workerSpecPath = null;
let sourceDir = null;

try {
  const stuckPath = safePathJoin(stuckDir, `${workerId}.json`);
  const failedPath = safePathJoin(failedDir, `${workerId}.json`);

  if (await fs.access(stuckPath).then(() => true).catch(() => false)) {
    workerSpecPath = stuckPath;
    sourceDir = 'stuck';
  } else if (await fs.access(failedPath).then(() => true).catch(() => false)) {
    workerSpecPath = failedPath;
    sourceDir = 'failed';
  } else {
    return res.status(404).json({
      error: 'Worker spec not found in stuck/ or failed/ directories'
    });
  }
} catch (error) {
  return res.status(400).json({
    error: 'Invalid worker ID or path'
  });
}
```

### Step 3: Update Worker Spawn Section (around line 1312)

**FIND:**
```javascript
try {
  const spawnScript = path.join(__dirname, '../../agents/workers/autonomous-worker.sh');
  execSync(`bash ${spawnScript} ${activePath} > /dev/null 2>&1 &`);
} catch (spawnError) {
  console.error('Error spawning worker:', spawnError);
}
```

**REPLACE WITH:**
```javascript
try {
  if (!isValidWorkerId(workerId)) {
    throw new Error('Invalid worker ID format');
  }

  const spawnScript = path.join(__dirname, '../../agents/workers/autonomous-worker.sh');
  const activePath = safePathJoin(activeDir, `${workerId}.json`);

  if (!activePath.startsWith(path.join(__dirname, '../../coordination/worker-specs'))) {
    throw new Error('Invalid worker spec path');
  }

  if (!fsSync.existsSync(spawnScript)) {
    throw new Error('Spawn script not found');
  }

  const logFile = fsSync.openSync('/dev/null', 'w');
  const workerProcess = spawn('bash', [spawnScript, activePath], {
    detached: true,
    stdio: ['ignore', logFile, logFile]
  });

  workerProcess.unref();

} catch (spawnError) {
  console.error('Error spawning worker:', spawnError);
}
```

---

## Fix #5: File Operation Race Conditions (6 hours)

### Step 1: Add Locking Helper (after imports)

```javascript
const lockfile = require('proper-lockfile');

/**
 * Atomic file update with locking
 */
async function atomicFileUpdate(filePath, updateFn, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    let release;
    try {
      // Acquire exclusive lock
      release = await lockfile.lock(filePath, {
        retries: {
          retries: 5,
          minTimeout: 100,
          maxTimeout: 1000
        }
      });

      // Read current data
      const currentData = await readJSON(filePath);

      // Apply update function
      const updatedData = await updateFn(currentData);

      // Write atomically
      const tempFile = `${filePath}.tmp`;
      await fs.writeFile(tempFile, JSON.stringify(updatedData, null, 2), 'utf-8');
      await fs.rename(tempFile, filePath);

      return updatedData;

    } finally {
      if (release) {
        await release();
      }
    }
  }
  throw new Error('Failed to acquire file lock after retries');
}
```

### Step 2: Update Health Alert Resolve (Lines 1167-1217)

**REPLACE the endpoint WITH:**

```javascript
app.post('/api/health-alerts/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution_note } = req.body;

    const healthAlertsPath = path.join(__dirname, '../../coordination/health-alerts.json');

    // Atomic update with locking
    const updatedData = await atomicFileUpdate(healthAlertsPath, (healthAlertsData) => {
      if (!healthAlertsData || !healthAlertsData.alerts) {
        throw new Error('Health alerts file not found');
      }

      const alertIndex = healthAlertsData.alerts.findIndex(a => a.id === id);
      if (alertIndex === -1) {
        throw new Error('Alert not found');
      }

      healthAlertsData.alerts[alertIndex].status = 'resolved';
      healthAlertsData.alerts[alertIndex].resolved_at = new Date().toISOString();

      if (!healthAlertsData.alerts[alertIndex].resolution_notes) {
        healthAlertsData.alerts[alertIndex].resolution_notes = [];
      }

      if (resolution_note) {
        healthAlertsData.alerts[alertIndex].resolution_notes.push(resolution_note);
      }

      return healthAlertsData;
    });

    const alert = updatedData.alerts.find(a => a.id === id);

    emitDashboardEvent('health_alert_resolved', {
      alert_id: alert.id,
      alert_type: alert.type,
      severity: alert.severity,
      message: `Health alert resolved: ${alert.message}`
    });

    res.json({
      success: true,
      alert: alert,
      message: 'Alert marked as resolved'
    });
  } catch (error) {
    console.error('Error resolving alert:', error);
    if (error.message === 'Health alerts file not found') {
      res.status(404).json({ error: error.message });
    } else if (error.message === 'Alert not found') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});
```

### Step 3: Apply Same Pattern to Other Endpoints

Apply `atomicFileUpdate` to:
- `POST /api/health-alerts/:id/note` (lines 1333-1384)
- `DELETE /api/health-alerts/:id` (lines 1390-1429)

---

## Fix #6: Error Information Disclosure (2 hours)

### Step 1: Add Error Classes (before route definitions)

```javascript
class APIError extends Error {
  constructor(message, statusCode = 500, details = null, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.code = code;
  }

  toJSON() {
    const response = {
      error: true,
      message: this.message,
      code: this.code || this.statusCode.toString(),
      timestamp: new Date().toISOString()
    };

    if (process.env.NODE_ENV === 'development' && this.details) {
      response.details = this.details;
    }

    return response;
  }
}

function successResponse(data, message = null) {
  const response = {
    success: true,
    data
  };

  if (message) {
    response.message = message;
  }

  return response;
}
```

### Step 2: Add Error Handler (BEFORE graceful shutdown, around line 3072)

```javascript
// Error handling middleware
app.use((err, req, res, next) => {
  // Log full error server-side
  console.error('API Error:', {
    path: req.path,
    method: req.method,
    error: err.message,
    stack: err.stack,
    details: err.details
  });

  // Determine response
  const statusCode = err.statusCode || 500;
  const response = {
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  };

  // Only include details in development
  if (process.env.NODE_ENV === 'development' && err.details) {
    response.details = err.details;
  }

  res.status(statusCode).json(response);
});

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`
  });
});
```

### Step 3: Update Sample Endpoint to Use Error Handler

**Example - update `/api/metrics` (lines 555-573):**

```javascript
app.get('/api/metrics', async (req, res, next) => {
  try {
    const period = req.query.period || 'all_time';
    const data = await loadCoordinationData(false);
    const metrics = calculateMetrics(data, period);

    if (!metrics) {
      throw new APIError('Failed to calculate metrics', 500,
        'Coordination files may be missing or invalid');
    }

    res.json(metrics);
  } catch (error) {
    next(error instanceof APIError ? error : new APIError('Internal server error', 500, error.message));
  }
});
```

Apply this pattern to all other endpoints gradually.

---

## Testing Your Fixes

### Test Script

Create `/Users/ryandahlberg/projects/commit-relay/test-api-security.sh`:

```bash
#!/bin/bash

API_URL="http://localhost:3000"
API_KEY="your-secure-random-key-here"
WRITE_KEY="your-secure-write-key-here"

echo "=== API Security Test Suite ==="
echo ""

# Test 1: Authentication
echo "Test 1: Authentication required"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $API_URL/api/metrics)
if [ "$RESPONSE" == "401" ]; then
  echo "✓ PASS: Unauthenticated request rejected"
else
  echo "✗ FAIL: Expected 401, got $RESPONSE"
fi

# Test 2: Valid authentication
echo "Test 2: Valid authentication"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -H "X-API-Key: $API_KEY" $API_URL/api/metrics)
if [ "$RESPONSE" == "200" ]; then
  echo "✓ PASS: Authenticated request accepted"
else
  echo "✗ FAIL: Expected 200, got $RESPONSE"
fi

# Test 3: Write access required
echo "Test 3: Write access control"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"start"}' \
  $API_URL/api/daemon/control)
if [ "$RESPONSE" == "403" ]; then
  echo "✓ PASS: Write operation requires write key"
else
  echo "✗ FAIL: Expected 403, got $RESPONSE"
fi

# Test 4: Rate limiting
echo "Test 4: Rate limiting (may take a minute)"
COUNT=0
for i in {1..105}; do
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -H "X-API-Key: $API_KEY" $API_URL/api/health)
  if [ "$RESPONSE" == "429" ]; then
    COUNT=$((COUNT + 1))
  fi
done
if [ "$COUNT" -gt "0" ]; then
  echo "✓ PASS: Rate limiting active (blocked $COUNT requests)"
else
  echo "✗ FAIL: Rate limiting not working"
fi

# Test 5: Path traversal protection
echo "Test 5: Path traversal protection"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "X-Write-Key: $WRITE_KEY" \
  -H "Content-Type: application/json" \
  $API_URL/api/health-alerts/../../etc/passwd/restart-worker)
if [ "$RESPONSE" == "400" ] || [ "$RESPONSE" == "404" ]; then
  echo "✓ PASS: Path traversal blocked"
else
  echo "✗ FAIL: Path traversal not blocked, got $RESPONSE"
fi

echo ""
echo "=== Test Suite Complete ==="
```

Run with:
```bash
chmod +x test-api-security.sh
./test-api-security.sh
```

---

## Rollback Plan

If issues occur after deployment:

### Quick Rollback

```bash
cd /Users/ryandahlberg/projects/commit-relay
git checkout HEAD~1 dashboard/server/index.js
npm restart dashboard
```

### Emergency Access

If locked out of API:

```bash
# Option 1: Temporarily disable auth
export DASHBOARD_API_KEY=""
npm restart dashboard

# Option 2: Use server logs to find valid API key
tail -f logs/dashboard.log
```

---

## Next Steps

1. Apply these 6 critical fixes immediately
2. Test thoroughly using the test script
3. Monitor logs for any issues
4. Schedule remaining fixes per full checklist
5. Plan security audit after all fixes applied

**Full documentation:**
- Complete review: `/Users/ryandahlberg/projects/commit-relay/docs/api-review-task-1762553438.md`
- Executive summary: `/Users/ryandahlberg/projects/commit-relay/docs/api-review-executive-summary.md`
- Full checklist: `/Users/ryandahlberg/projects/commit-relay/docs/api-fixes-checklist.md`
