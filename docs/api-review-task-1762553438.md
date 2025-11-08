# Commit-Relay API Review Report
**Task ID:** task-1762553438
**Review Date:** 2025-11-08
**Reviewer:** Development Master
**Scope:** Dashboard API Server (`dashboard/server/index.js`)

---

## Executive Summary

This comprehensive review of the commit-relay Dashboard API identified **32 distinct issues** across security, validation, error handling, performance, and architectural concerns. The analysis covers all API endpoints including MoE Intelligence, DDQD testing, worker management, health monitoring, and daemon control.

### Severity Breakdown
- **CRITICAL:** 8 issues (Security vulnerabilities, command injection risks)
- **HIGH:** 12 issues (Missing validation, error handling gaps)
- **MEDIUM:** 9 issues (Performance concerns, code quality)
- **LOW:** 3 issues (Documentation, minor improvements)

### Key Findings
1. **No authentication/authorization** on any endpoint (CRITICAL)
2. **Command injection vulnerabilities** in multiple daemon control endpoints (CRITICAL)
3. **Missing input validation** on 18+ endpoints
4. **Inconsistent error handling** throughout the API
5. **Race conditions** in file system operations
6. **No rate limiting** on expensive operations
7. **Memory leaks** in WebSocket event buffer and DDQD test storage

---

## CRITICAL Issues (Security Vulnerabilities)

### ISSUE #1: No Authentication/Authorization on Any Endpoint
**Severity:** CRITICAL
**Endpoints Affected:** ALL (40+ endpoints)

**Description:**
The entire API is completely open with no authentication or authorization checks. Any user with network access can:
- Start/stop daemons
- Execute arbitrary commands
- Access sensitive system data
- Modify health alerts
- Restart workers
- Purge event logs

**Impact:**
- Unauthorized system control
- Data exposure
- Denial of service attacks
- System compromise

**Root Cause:**
No authentication middleware configured. CORS is wide open (`app.use(cors())`).

**Solution:**
Implement authentication middleware with API key or JWT tokens. Add role-based access control for destructive operations.

**Code Fix:**
```javascript
// OLD (lines 20-23):
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// NEW:
// Authentication middleware
const API_KEY = process.env.DASHBOARD_API_KEY || 'change-me-in-production';

function authenticateRequest(req, res, next) {
  // Allow public access to static files and health check
  if (req.path.startsWith('/api/health') || !req.path.startsWith('/api/')) {
    return next();
  }

  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid API key required'
    });
  }

  next();
}

// Authorization middleware for destructive operations
function requireWriteAccess(req, res, next) {
  // In production, check user roles/permissions
  const dangerousOperations = [
    '/api/daemon/control',
    '/api/pm-daemon/control',
    '/api/health-daemon/control',
    '/api/metrics-daemon/control',
    '/api/dashboard-server/control',
    '/api/event-log/purge',
    '/api/health-alerts/:id/restart-worker',
    '/api/health-alerts/:id/repair'
  ];

  if (dangerousOperations.some(path => req.path.includes(path.split(':')[0]))) {
    const writeKey = req.headers['x-write-key'];
    if (!writeKey || writeKey !== process.env.DASHBOARD_WRITE_KEY) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Write access required for this operation'
      });
    }
  }

  next();
}

// CORS configuration - restrict to known origins
const corsOptions = {
  origin: process.env.DASHBOARD_ALLOWED_ORIGINS
    ? process.env.DASHBOARD_ALLOWED_ORIGINS.split(',')
    : 'http://localhost:3000',
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' })); // Add size limit
app.use(authenticateRequest);
app.use(requireWriteAccess);
app.use(express.static(path.join(__dirname, '../public')));
```

---

### ISSUE #2: Command Injection in Daemon Control Endpoints
**Severity:** CRITICAL
**Endpoints Affected:**
- `POST /api/daemon/control`
- `POST /api/pm-daemon/control`
- `POST /api/health-daemon/control`
- `POST /api/metrics-daemon/control`
- `POST /api/health-alerts/:id/restart-worker`

**Description:**
Multiple endpoints use `execSync()` to execute bash scripts without proper input sanitization. While the current implementation doesn't directly use user input in commands, the pattern is dangerous and could lead to command injection if modified.

**Example (lines 1814-1815):**
```javascript
execSync(`bash ${scriptPath} > /tmp/worker-daemon-start.log 2>&1 &`);
```

**Impact:**
- Arbitrary command execution on the server
- System compromise
- Data exfiltration

**Root Cause:**
Direct use of shell execution without safe alternatives or input validation.

**Solution:**
Use `spawn()` with array arguments instead of shell commands, or validate/sanitize all inputs.

**Code Fix:**
```javascript
// OLD (lines 1791-1837):
app.post('/api/daemon/control', async (req, res) => {
  const { execSync } = require('child_process');
  const { action } = req.body; // 'start' or 'stop'

  try {
    const scriptPath = path.join(__dirname, '../../scripts/worker-daemon.sh');

    if (action === 'start') {
      // ... existing code ...
      execSync(`bash ${scriptPath} > /tmp/worker-daemon-start.log 2>&1 &`);
      // ...
    } else if (action === 'stop') {
      execSync(`bash ${scriptPath} stop`, { stdio: 'pipe' });
      // ...
    }
  } catch (error) {
    // ...
  }
});

// NEW:
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

      // Check if already running
      if (fsSync.existsSync(PID_FILE)) {
        const pid = parseInt(fsSync.readFileSync(PID_FILE, 'utf-8').trim());
        try {
          process.kill(pid, 0); // Check if process exists
          return res.json({
            success: false,
            message: 'Worker daemon is already running',
            pid
          });
        } catch (e) {
          // Process doesn't exist, clean up stale PID
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

      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Read the new PID
      if (fsSync.existsSync(PID_FILE)) {
        const pid = parseInt(fsSync.readFileSync(PID_FILE, 'utf-8').trim());
        res.json({ success: true, message: 'Worker daemon started', pid });
      } else {
        res.json({ success: false, message: 'Worker daemon may have failed to start' });
      }

    } else if (action === 'stop') {
      // Use spawn instead of execSync
      const stopProcess = spawn('bash', [scriptPath, 'stop'], {
        stdio: 'pipe'
      });

      stopProcess.on('close', (code) => {
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
        res.status(500).json({ success: false, message: error.message });
      });
    }
  } catch (error) {
    console.error('Error controlling worker daemon:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
```

**Apply similar fixes to:**
- `POST /api/pm-daemon/control` (lines 1843-1903)
- `POST /api/health-daemon/control` (lines 1944-1993)
- `POST /api/metrics-daemon/control` (lines 2034-2083)

---

### ISSUE #3: Command Injection in Health Alert Restart Worker
**Severity:** CRITICAL
**Endpoint:** `POST /api/health-alerts/:id/restart-worker`

**Description:**
Line 1312 executes a shell command with potential user-controlled data (`activePath`):
```javascript
execSync(`bash ${spawnScript} ${activePath} > /dev/null 2>&1 &`);
```

While `activePath` is constructed from `workerId`, if `workerId` contains special characters, it could lead to command injection.

**Impact:**
- Command injection
- Arbitrary code execution

**Root Cause:**
Shell command construction with insufficiently validated file paths.

**Solution:**
Validate `workerId` format, use `spawn()` with array arguments.

**Code Fix:**
```javascript
// OLD (lines 1309-1316):
try {
  const spawnScript = path.join(__dirname, '../../agents/workers/autonomous-worker.sh');
  execSync(`bash ${spawnScript} ${activePath} > /dev/null 2>&1 &`);
} catch (spawnError) {
  console.error('Error spawning worker:', spawnError);
}

// NEW:
try {
  // Validate worker ID format (alphanumeric, hyphens, underscores only)
  if (!/^[a-zA-Z0-9-_]+$/.test(workerId)) {
    throw new Error('Invalid worker ID format');
  }

  const spawnScript = path.join(__dirname, '../../agents/workers/autonomous-worker.sh');

  // Verify paths are in expected locations
  if (!activePath.startsWith(path.join(__dirname, '../../coordination/worker-specs'))) {
    throw new Error('Invalid worker spec path');
  }

  if (!fsSync.existsSync(spawnScript)) {
    throw new Error('Spawn script not found');
  }

  // Use spawn with array arguments
  const logFile = fsSync.openSync('/dev/null', 'w');
  const workerProcess = spawn('bash', [spawnScript, activePath], {
    detached: true,
    stdio: ['ignore', logFile, logFile]
  });

  workerProcess.unref();

} catch (spawnError) {
  console.error('Error spawning worker:', spawnError);
  // Don't fail the request - worker spec is moved, spawn will be attempted by daemon
}
```

---

### ISSUE #4: Path Traversal Vulnerability in File Operations
**Severity:** CRITICAL
**Endpoints Affected:**
- `POST /api/health-alerts/:id/restart-worker`
- Various file reading operations

**Description:**
Lines 1246-1265 construct file paths from user-controlled `workerId` without proper validation:
```javascript
const stuckPath = path.join(stuckDir, `${workerId}.json`);
```

If `workerId` contains path traversal sequences like `../../`, it could access files outside intended directories.

**Impact:**
- Unauthorized file access
- Information disclosure
- Potential file manipulation

**Root Cause:**
Insufficient input validation on path construction.

**Solution:**
Validate that resolved paths stay within expected directories.

**Code Fix:**
```javascript
// Add this helper function at the top of the file (after imports):

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

// Then use it in the restart-worker endpoint (lines 1244-1265):
// OLD:
const workerId = alert.worker_id;
const workerSpecsDir = path.join(__dirname, '../../coordination/worker-specs');
const stuckDir = path.join(workerSpecsDir, 'stuck');
const failedDir = path.join(workerSpecsDir, 'failed');
const activeDir = path.join(workerSpecsDir, 'active');

let workerSpecPath = null;
let sourceDir = null;

const stuckPath = path.join(stuckDir, `${workerId}.json`);
const failedPath = path.join(failedDir, `${workerId}.json`);

// NEW:
const workerId = alert.worker_id;

// Validate worker ID format
if (!workerId || !/^[a-zA-Z0-9-_]+$/.test(workerId)) {
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

// Use safe path joining to prevent traversal
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

---

### ISSUE #5: No Rate Limiting on Expensive Operations
**Severity:** CRITICAL
**Endpoints Affected:** All endpoints, especially:
- `POST /api/ddqd/run`
- `POST /api/daemon/control`
- `POST /api/health-alerts/:id/repair`
- `POST /api/event-log/purge`

**Description:**
No rate limiting exists on any endpoint. An attacker could:
- Spawn unlimited DDQD tests (memory/CPU exhaustion)
- Repeatedly start/stop daemons (DOS)
- Create thousands of repair tasks
- Overwhelm the system with requests

**Impact:**
- Denial of service
- Resource exhaustion
- System crash

**Root Cause:**
No rate limiting middleware configured.

**Solution:**
Implement rate limiting using express-rate-limit.

**Code Fix:**
```javascript
// Add to package.json dependencies:
// "express-rate-limit": "^7.1.5"

// Add after imports (line 16):
const rateLimit = require('express-rate-limit');

// Add after CORS setup (line 23):
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
  message: { error: 'DDQD test rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply to all API routes
app.use('/api/', apiLimiter);

// Apply strict limiting to specific routes (add before route handlers):
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

---

### ISSUE #6: Unrestricted File Upload Size
**Severity:** CRITICAL
**Endpoint:** All POST endpoints accepting JSON

**Description:**
Line 22 shows no size limit on JSON body parsing:
```javascript
app.use(express.json());
```

An attacker could send extremely large JSON payloads causing memory exhaustion.

**Impact:**
- Memory exhaustion
- Denial of service
- Application crash

**Root Cause:**
No body size limit configured.

**Solution:**
Add size limits to JSON and URL-encoded body parsers.

**Code Fix:**
```javascript
// OLD (line 22):
app.use(express.json());

// NEW:
app.use(express.json({ limit: '1mb' })); // Limit JSON body to 1MB
app.use(express.urlencoded({ extended: true, limit: '1mb' })); // Also limit URL-encoded
```

---

### ISSUE #7: Race Conditions in File Operations
**Severity:** CRITICAL
**Endpoints Affected:**
- `POST /api/health-alerts/:id/resolve`
- `POST /api/health-alerts/:id/note`
- `DELETE /api/health-alerts/:id`
- `POST /api/event-log/purge`

**Description:**
Multiple endpoints use read-modify-write pattern without locking (example lines 1172-1197):
```javascript
const healthAlertsData = await readJSON(healthAlertsPath);
// ... modify data ...
await fs.writeFile(healthAlertsPath, JSON.stringify(healthAlertsData, null, 2));
```

Concurrent requests can overwrite each other's changes, leading to data loss.

**Impact:**
- Data corruption
- Lost updates
- Inconsistent state

**Root Cause:**
No file locking or atomic operations.

**Solution:**
Implement file locking mechanism or use atomic writes with compare-and-swap.

**Code Fix:**
```javascript
// Add at top of file after imports:
const lockfile = require('proper-lockfile');

// Helper function for atomic file updates
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
      // Always release lock
      if (release) {
        await release();
      }
    }
  }
  throw new Error('Failed to acquire file lock after retries');
}

// Then use it in endpoints, e.g., resolve alert (lines 1167-1217):
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

      // Update alert
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

    // Emit dashboard event
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

---

### ISSUE #8: Sensitive Error Information Disclosure
**Severity:** CRITICAL
**Endpoints Affected:** Multiple endpoints

**Description:**
Many endpoints expose internal error details to clients (example line 571):
```javascript
res.status(500).json({ error: 'Internal server error' });
```

Some expose even more details:
```javascript
res.status(500).json({ error: 'Failed to create repair task', details: error.message });
```

This can leak sensitive file paths, system information, and implementation details.

**Impact:**
- Information disclosure
- Helps attackers understand system internals
- Security through obscurity compromised

**Root Cause:**
Inconsistent error handling, detailed error responses.

**Solution:**
Centralized error handler that logs details server-side but returns generic messages to clients.

**Code Fix:**
```javascript
// Add centralized error handler before route definitions:

class APIError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

// Error handling middleware (add before graceful shutdown section)
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

// Then update endpoints to use next(error), example:
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

---

## HIGH Severity Issues

### ISSUE #9: Missing Input Validation on Query Parameters
**Severity:** HIGH
**Endpoints Affected:**
- `GET /api/metrics` (period parameter)
- `GET /api/metrics/history` (range, granularity)
- `GET /api/events` (limit, session)
- `GET /api/git-operations` (limit, worker_id, status)

**Description:**
Query parameters are used without validation. Example (line 557):
```javascript
const period = req.query.period || 'all_time';
```

No validation that `period` is a valid value. Similar issues with numeric limits.

**Impact:**
- Invalid data processing
- Unexpected behavior
- Potential injection attacks

**Root Cause:**
No input validation layer.

**Solution:**
Validate all query parameters before use.

**Code Fix:**
```javascript
// Create validation helper:
function validateQueryParams(req, schema) {
  const errors = [];

  for (const [param, rules] of Object.entries(schema)) {
    const value = req.query[param];

    if (rules.required && !value) {
      errors.push(`Missing required parameter: ${param}`);
      continue;
    }

    if (value && rules.enum && !rules.enum.includes(value)) {
      errors.push(`Invalid ${param}: must be one of ${rules.enum.join(', ')}`);
    }

    if (value && rules.type === 'number') {
      const num = parseInt(value);
      if (isNaN(num)) {
        errors.push(`${param} must be a number`);
      } else if (rules.min !== undefined && num < rules.min) {
        errors.push(`${param} must be >= ${rules.min}`);
      } else if (rules.max !== undefined && num > rules.max) {
        errors.push(`${param} must be <= ${rules.max}`);
      }
    }
  }

  return errors;
}

// Use in endpoints:
app.get('/api/metrics', async (req, res, next) => {
  try {
    const errors = validateQueryParams(req, {
      period: {
        enum: ['current_run', 'last_24h', 'last_7d', 'all_time'],
        required: false
      }
    });

    if (errors.length > 0) {
      throw new APIError('Validation failed', 400, errors.join('; '));
    }

    const period = req.query.period || 'all_time';
    const data = await loadCoordinationData(false);
    const metrics = calculateMetrics(data, period);

    if (!metrics) {
      throw new APIError('Failed to calculate metrics', 500);
    }

    res.json(metrics);
  } catch (error) {
    next(error instanceof APIError ? error : new APIError('Internal server error', 500));
  }
});

app.get('/api/events', async (req, res, next) => {
  try {
    const errors = validateQueryParams(req, {
      limit: { type: 'number', min: 1, max: 1000, required: false },
      session: { enum: ['current'], required: false }
    });

    if (errors.length > 0) {
      throw new APIError('Validation failed', 400, errors.join('; '));
    }

    const limit = parseInt(req.query.limit) || 50;
    const sessionOnly = req.query.session === 'current';
    // ... rest of handler
  } catch (error) {
    next(error instanceof APIError ? error : new APIError('Internal server error', 500));
  }
});
```

---

### ISSUE #10: Missing Validation on Request Body Fields
**Severity:** HIGH
**Endpoints Affected:**
- `POST /api/daemon/control` (action field)
- `POST /api/health-alerts/:id/note` (note field)
- `POST /api/ddqd/run` (duration, maxWorkers, version)
- `POST /api/ddqd/schedule` (cronExpression, testConfig)

**Description:**
Request bodies lack comprehensive validation. Example (line 1338):
```javascript
if (!note || !note.trim()) {
  return res.status(400).json({ error: 'Note is required' });
}
```

This is good, but inconsistent. Many endpoints don't validate at all.

**Impact:**
- Invalid data stored
- Application errors
- Security vulnerabilities

**Root Cause:**
No consistent validation strategy.

**Solution:**
Use a validation library like Joi or implement comprehensive validation.

**Code Fix:**
```javascript
// Install: npm install joi
const Joi = require('joi');

// Define schemas
const schemas = {
  daemonControl: Joi.object({
    action: Joi.string().valid('start', 'stop').required()
  }),

  alertNote: Joi.object({
    note: Joi.string().trim().min(1).max(1000).required()
  }),

  ddqdRun: Joi.object({
    duration: Joi.number().integer().min(1).max(60).required(),
    maxWorkers: Joi.number().integer().min(1).max(100).default(10),
    version: Joi.string().valid('v4', 'v5').required(),
    verbose: Joi.boolean().default(false)
  }),

  ddqdSchedule: Joi.object({
    enabled: Joi.boolean().required(),
    cronExpression: Joi.string().pattern(/^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/).required(),
    testConfig: Joi.object({
      duration: Joi.number().integer().min(1).max(60).required(),
      version: Joi.string().valid('v4', 'v5').required()
    }).required()
  })
};

// Validation middleware
function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const details = error.details.map(d => d.message).join('; ');
      return next(new APIError('Validation failed', 400, details));
    }

    req.body = value; // Use validated/sanitized values
    next();
  };
}

// Apply to endpoints:
app.post('/api/daemon/control', validate(schemas.daemonControl), async (req, res, next) => {
  // req.body is now validated
  const { action } = req.body;
  // ... rest of handler
});

app.post('/api/health-alerts/:id/note', validate(schemas.alertNote), async (req, res, next) => {
  // ... handler
});

app.post('/api/ddqd/run', validate(schemas.ddqdRun), async (req, res, next) => {
  // ... handler
});

app.post('/api/ddqd/schedule', validate(schemas.ddqdSchedule), async (req, res, next) => {
  // ... handler
});
```

---

### ISSUE #11: Missing Validation on Path Parameters
**Severity:** HIGH
**Endpoints Affected:**
- `GET /api/ddqd/status/:testId`
- `POST /api/ddqd/stop/:testId`
- `POST /api/health-alerts/:id/*` (all alert endpoints)

**Description:**
Path parameters like `:id` and `:testId` are used without validation. Example (line 1169):
```javascript
const { id } = req.params;
```

No validation that `id` is properly formatted.

**Impact:**
- Invalid lookups
- Potential injection
- Error conditions

**Root Cause:**
No path parameter validation.

**Solution:**
Validate format and existence of path parameters.

**Code Fix:**
```javascript
// Add validation middleware for path params:
function validatePathParam(paramName, pattern, errorMessage) {
  return (req, res, next) => {
    const value = req.params[paramName];

    if (!value) {
      return next(new APIError(`Missing ${paramName}`, 400));
    }

    if (pattern && !pattern.test(value)) {
      return next(new APIError(errorMessage || `Invalid ${paramName} format`, 400));
    }

    next();
  };
}

// Apply to routes:
app.post(
  '/api/health-alerts/:id/resolve',
  validatePathParam('id', /^alert-[a-zA-Z0-9-]+$/, 'Invalid alert ID format'),
  async (req, res, next) => {
    // ... handler
  }
);

app.get(
  '/api/ddqd/status/:testId',
  validatePathParam('testId', /^ddqd-v[45]-\d+$/, 'Invalid test ID format'),
  (req, res, next) => {
    // ... handler
  }
);
```

---

### ISSUE #12: No Timeout on Child Processes
**Severity:** HIGH
**Endpoints Affected:**
- `POST /api/ddqd/run`
- All daemon control endpoints

**Description:**
Spawned processes have no timeout configured (lines 2834-2839):
```javascript
const ddqdProcess = spawn(scriptPath, args, {
  env,
  cwd: path.join(__dirname, '../..'),
  shell: true
});
```

Processes could hang indefinitely, consuming resources.

**Impact:**
- Resource exhaustion
- Zombie processes
- Memory leaks

**Root Cause:**
No process timeout mechanism.

**Solution:**
Implement timeouts for all spawned processes.

**Code Fix:**
```javascript
// OLD (lines 2834-2851):
const ddqdProcess = spawn(scriptPath, args, {
  env,
  cwd: path.join(__dirname, '../..'),
  shell: true
});

const testData = {
  testId,
  version,
  duration,
  maxWorkers,
  verbose,
  startTime,
  status: 'running',
  progress: 0,
  output: [],
  process: ddqdProcess
};

// NEW:
const ddqdProcess = spawn(scriptPath, args, {
  env,
  cwd: path.join(__dirname, '../..'),
  shell: true
});

const testData = {
  testId,
  version,
  duration,
  maxWorkers,
  verbose,
  startTime,
  status: 'running',
  progress: 0,
  output: [],
  process: ddqdProcess,
  timeoutHandle: null
};

// Set timeout (duration + 5 minutes grace period)
const timeoutMs = (duration * 60 * 1000) + (5 * 60 * 1000);
testData.timeoutHandle = setTimeout(() => {
  if (testData.status === 'running') {
    console.warn(`DDQD test ${testId} exceeded timeout, killing process`);
    try {
      process.kill(-ddqdProcess.pid, 'SIGKILL'); // Kill process group
    } catch (error) {
      console.error('Error killing timed out DDQD process:', error);
    }
    testData.status = 'timeout';
    testData.endTime = new Date().toISOString();
  }
}, timeoutMs);

// Clear timeout on process completion
ddqdProcess.on('close', (code) => {
  if (testData.timeoutHandle) {
    clearTimeout(testData.timeoutHandle);
  }
  // ... rest of close handler
});
```

---

### ISSUE #13: Memory Leak in Event Buffer
**Severity:** HIGH
**Location:** Lines 48-50, 2766-2770

**Description:**
The `eventBuffer` array grows unbounded if no WebSocket clients are connected:
```javascript
eventBuffer.push(event);
if (eventBuffer.length > EVENT_BUFFER_SIZE) {
  eventBuffer.shift();
}
```

While it has a size limit, events keep accumulating even when unnecessary.

**Impact:**
- Memory leaks over time
- Wasted memory
- Potential performance degradation

**Root Cause:**
Buffer management doesn't account for client connection state.

**Solution:**
Only maintain buffer when clients are connected, or periodically clear old events.

**Code Fix:**
```javascript
// OLD (lines 48-50):
const EVENT_BUFFER_SIZE = 50;
let eventBuffer = [];

// NEW:
const EVENT_BUFFER_SIZE = 50;
let eventBuffer = [];
let lastBufferClean = Date.now();
const BUFFER_CLEAN_INTERVAL = 5 * 60 * 1000; // Clean every 5 minutes

// Add cleanup function:
function cleanEventBuffer() {
  const now = Date.now();

  // If no clients connected and buffer hasn't been cleaned recently
  if (clients.size === 0 && (now - lastBufferClean) > BUFFER_CLEAN_INTERVAL) {
    const eventsToKeep = 10; // Keep only last 10 events when no clients
    if (eventBuffer.length > eventsToKeep) {
      eventBuffer = eventBuffer.slice(-eventsToKeep);
      lastBufferClean = now;
      console.log(`Cleaned event buffer, kept ${eventsToKeep} events`);
    }
  }
}

// Update broadcastEvent function (lines 2765-2783):
function broadcastEvent(event) {
  // Add to event buffer (circular buffer)
  eventBuffer.push(event);
  if (eventBuffer.length > EVENT_BUFFER_SIZE) {
    eventBuffer.shift(); // Remove oldest event
  }

  // Clean buffer periodically
  cleanEventBuffer();

  const message = JSON.stringify({
    type: 'event',
    event: event,
    timestamp: new Date().toISOString()
  });

  clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  });
}
```

---

### ISSUE #14: Memory Leak in DDQD Tests Map
**Severity:** HIGH
**Location:** Lines 2818, 2884-2886

**Description:**
`ddqdTests` Map has 5-minute cleanup timer, but:
1. Timers can accumulate if process doesn't exit normally
2. No maximum size limit on the Map
3. Old test data kept in memory unnecessarily

**Impact:**
- Memory leaks
- Unbounded growth
- Performance degradation

**Root Cause:**
Insufficient cleanup logic.

**Solution:**
Add max size limit, proper cleanup on server shutdown, periodic cleanup.

**Code Fix:**
```javascript
// OLD (line 2818):
const ddqdTests = new Map(); // Store active DDQD tests

// NEW:
const ddqdTests = new Map(); // Store active DDQD tests
const MAX_DDQD_TESTS = 50; // Maximum tests to keep in memory
const DDQD_CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes

// Cleanup old tests
function cleanupOldDDQDTests() {
  const now = Date.now();
  const expiryTime = 10 * 60 * 1000; // 10 minutes

  for (const [testId, testData] of ddqdTests.entries()) {
    // Remove completed/failed tests older than 10 minutes
    if (testData.status !== 'running' && testData.endTime) {
      const age = now - new Date(testData.endTime).getTime();
      if (age > expiryTime) {
        // Clear timeout if exists
        if (testData.timeoutHandle) {
          clearTimeout(testData.timeoutHandle);
        }
        ddqdTests.delete(testId);
        console.log(`Cleaned up old DDQD test: ${testId}`);
      }
    }
  }

  // If still too many tests, remove oldest completed ones
  if (ddqdTests.size > MAX_DDQD_TESTS) {
    const completed = Array.from(ddqdTests.entries())
      .filter(([_, test]) => test.status !== 'running')
      .sort((a, b) => new Date(a[1].endTime) - new Date(b[1].endTime));

    const toRemove = completed.slice(0, completed.length - MAX_DDQD_TESTS);
    toRemove.forEach(([testId, testData]) => {
      if (testData.timeoutHandle) {
        clearTimeout(testData.timeoutHandle);
      }
      ddqdTests.delete(testId);
    });
  }
}

// Run cleanup periodically
const ddqdCleanupInterval = setInterval(cleanupOldDDQDTests, DDQD_CLEANUP_INTERVAL);

// Update close handler (lines 2884-2886) to NOT use setTimeout:
ddqdProcess.on('close', (code) => {
  if (testData.timeoutHandle) {
    clearTimeout(testData.timeoutHandle);
  }

  testData.status = code === 0 ? 'completed' : 'failed';
  testData.progress = 100;
  testData.endTime = new Date().toISOString();
  testData.exitCode = code;

  // Save to history
  // ... existing history code ...

  // Don't use setTimeout - let periodic cleanup handle it
});

// Add cleanup to graceful shutdown (after line 3083):
process.on('SIGINT', () => {
  console.log('\nShutting down dashboard server...');

  // Clear all DDQD test timeouts
  for (const testData of ddqdTests.values()) {
    if (testData.timeoutHandle) {
      clearTimeout(testData.timeoutHandle);
    }
    if (testData.process && testData.status === 'running') {
      testData.process.kill('SIGTERM');
    }
  }
  ddqdTests.clear();

  clearInterval(ddqdCleanupInterval);
  watcher.close();
  eventWatcher.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
```

---

### ISSUE #15: Unsafe Use of `eval()` Equivalent in Shell Commands
**Severity:** HIGH
**Location:** Lines 2107-2108, 2266-2267, 2332-2333

**Description:**
Multiple endpoints use `jq -s '.'` with unsanitized file paths:
```javascript
const { stdout } = await execAsync(`jq -s '.' "${routingLogPath}"`);
```

If `routingLogPath` were ever user-controlled or contained special characters, this could lead to command injection.

**Impact:**
- Command injection
- Arbitrary code execution

**Root Cause:**
Shell command construction with file paths.

**Solution:**
Use safer alternatives or validate paths are in expected locations.

**Code Fix:**
```javascript
// Create safe jq helper:
async function safeJqParse(filePath) {
  // Verify file path is in expected directory
  const allowedDirs = [
    path.join(COMMIT_RELAY_HOME, 'coordination'),
    path.join(__dirname, '../../coordination')
  ];

  const normalizedPath = path.normalize(filePath);
  const isAllowed = allowedDirs.some(dir =>
    normalizedPath.startsWith(path.normalize(dir))
  );

  if (!isAllowed) {
    throw new Error('File path not in allowed directory');
  }

  if (!fsSync.existsSync(filePath)) {
    return [];
  }

  // Use spawn instead of exec to avoid shell interpretation
  return new Promise((resolve, reject) => {
    const jqProcess = spawn('jq', ['-s', '.', filePath], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    jqProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    jqProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    jqProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`jq failed: ${stderr}`));
      } else {
        try {
          resolve(JSON.parse(stdout));
        } catch (error) {
          reject(new Error(`Failed to parse jq output: ${error.message}`));
        }
      }
    });

    jqProcess.on('error', (error) => {
      reject(error);
    });
  });
}

// Use in endpoints:
app.get('/api/moe/routing', async (req, res, next) => {
  try {
    const routingLogPath = path.join(COMMIT_RELAY_HOME, 'coordination', 'masters', 'coordinator', 'logs', 'routing-decisions.jsonl');

    const allDecisions = await safeJqParse(routingLogPath);
    const decisions = allDecisions.slice(-100).reverse();

    res.json({ decisions });
  } catch (error) {
    next(new APIError('Failed to fetch routing decisions', 500, error.message));
  }
});
```

---

### ISSUE #16: No Request Timeout Configuration
**Severity:** HIGH
**Location:** Server configuration (line 2567)

**Description:**
No global request timeout is configured. Long-running requests can tie up resources indefinitely.

**Impact:**
- Resource exhaustion
- Slow loris attacks
- Poor user experience

**Root Cause:**
No timeout middleware.

**Solution:**
Add request timeout middleware.

**Code Fix:**
```javascript
// Add after rate limiting (around line 23):
const timeout = require('connect-timeout');

// Set 30 second timeout for all requests
app.use(timeout('30s'));

// Timeout handler
app.use((req, res, next) => {
  if (!req.timedout) next();
});

// Update error handler to catch timeouts:
app.use((err, req, res, next) => {
  if (req.timedout) {
    console.error('Request timeout:', req.path);
    return res.status(408).json({
      error: 'Request timeout',
      message: 'The request took too long to process'
    });
  }

  // ... rest of error handler
});
```

---

### ISSUE #17: Inconsistent Error Responses
**Severity:** HIGH
**Location:** Throughout file

**Description:**
Error responses lack consistency:
- Some return `{ error: '...' }` (line 571)
- Some return `{ success: false, message: '...' }` (line 1832)
- Some return `{ error: '...', details: '...' }` (line 1550)
- Some return just strings

**Impact:**
- Poor API usability
- Client-side parsing difficulties
- Inconsistent error handling

**Root Cause:**
No standardized error response format.

**Solution:**
Define and enforce consistent error response schema.

**Code Fix:**
```javascript
// Standardized error response format:
class APIError extends Error {
  constructor(message, statusCode = 500, details = null, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.code = code; // Machine-readable error code
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

// Success response helper:
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

// Update all endpoints to use consistent format:
app.get('/api/metrics', async (req, res, next) => {
  try {
    // ... logic ...
    res.json(successResponse(metrics));
  } catch (error) {
    next(new APIError('Failed to load metrics', 500, error.message, 'METRICS_ERROR'));
  }
});

app.post('/api/daemon/control', async (req, res, next) => {
  try {
    // ... logic ...
    res.json(successResponse({ pid }, 'Daemon started successfully'));
  } catch (error) {
    next(new APIError('Failed to control daemon', 500, error.message, 'DAEMON_CONTROL_ERROR'));
  }
});
```

---

### ISSUE #18: Missing CORS Preflight Handling
**Severity:** HIGH
**Location:** Line 21

**Description:**
CORS is configured but doesn't explicitly handle OPTIONS preflight requests for complex requests.

**Impact:**
- CORS failures from browsers
- Failed API calls from web clients
- Poor developer experience

**Root Cause:**
Incomplete CORS configuration.

**Solution:**
Add explicit OPTIONS handling and proper CORS headers.

**Code Fix:**
```javascript
// OLD (line 21):
app.use(cors());

// NEW:
const corsOptions = {
  origin: process.env.DASHBOARD_ALLOWED_ORIGINS
    ? process.env.DASHBOARD_ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Write-Key'],
  exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page'],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// Explicit OPTIONS handler for all routes
app.options('*', cors(corsOptions));
```

---

### ISSUE #19: No Validation on File Writes
**Severity:** HIGH
**Location:** Multiple endpoints writing to files

**Description:**
File write operations don't validate:
- Disk space availability
- Write permissions
- File size limits
- Path traversal

**Impact:**
- Disk full errors
- Application crashes
- Data corruption

**Root Cause:**
No validation before file operations.

**Solution:**
Validate before file writes, handle errors gracefully.

**Code Fix:**
```javascript
// Add file write helper with validation:
async function safeFileWrite(filePath, data, options = {}) {
  const maxFileSize = options.maxSize || 10 * 1024 * 1024; // 10MB default

  // Check if data size is reasonable
  const dataSize = Buffer.byteLength(JSON.stringify(data));
  if (dataSize > maxFileSize) {
    throw new Error(`Data size (${dataSize} bytes) exceeds maximum (${maxFileSize} bytes)`);
  }

  // Check disk space (requires 'check-disk-space' package)
  const diskSpace = await checkDiskSpace(path.dirname(filePath));
  const requiredSpace = dataSize * 2; // Require 2x data size

  if (diskSpace.free < requiredSpace) {
    throw new Error(`Insufficient disk space. Required: ${requiredSpace}, Available: ${diskSpace.free}`);
  }

  // Validate path
  const allowedDirs = [
    path.join(__dirname, '../../coordination'),
    path.join(__dirname, '../../agents/logs')
  ];

  const normalizedPath = path.normalize(filePath);
  const isAllowed = allowedDirs.some(dir =>
    normalizedPath.startsWith(path.normalize(dir))
  );

  if (!isAllowed) {
    throw new Error('File path not in allowed directory');
  }

  // Ensure directory exists
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  // Write atomically via temp file
  const tempFile = `${filePath}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tempFile, filePath);
}

// Use in endpoints:
await safeFileWrite(healthAlertsPath, healthAlertsData, { maxSize: 5 * 1024 * 1024 });
```

---

### ISSUE #20: WebSocket Connection Not Authenticated
**Severity:** HIGH
**Location:** Lines 2582-2642

**Description:**
WebSocket connections have no authentication. Anyone can connect and receive real-time system updates.

**Impact:**
- Unauthorized data access
- Real-time system monitoring by attackers
- Information disclosure

**Root Cause:**
No WebSocket authentication.

**Solution:**
Implement WebSocket authentication via URL token or handshake.

**Code Fix:**
```javascript
// OLD (line 2582):
wss.on('connection', async (ws) => {
  console.log('WebSocket client connected');
  clients.add(ws);
  // ...
});

// NEW:
wss.on('connection', async (ws, req) => {
  // Extract token from URL or headers
  const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
  const token = urlParams.get('token') || req.headers['sec-websocket-protocol'];

  // Validate token
  const validToken = process.env.DASHBOARD_WS_TOKEN || API_KEY;
  if (token !== validToken) {
    console.warn('WebSocket connection rejected: invalid token');
    ws.close(4401, 'Unauthorized');
    return;
  }

  console.log('WebSocket client connected and authenticated');
  clients.add(ws);

  try {
    // Send initial data
    const data = await loadCoordinationData(false);
    const metrics = calculateMetrics(data);
    ws.send(JSON.stringify({ type: 'initial', data: metrics }));

    // ... rest of connection handler
  } catch (error) {
    console.error('Error sending initial data:', error);
    ws.close(1011, 'Internal error');
  }

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
    ws.close();
  });
});
```

---

## MEDIUM Severity Issues

### ISSUE #21: No Pagination on Large Data Sets
**Severity:** MEDIUM
**Endpoints Affected:**
- `GET /api/events`
- `GET /api/workers`
- `GET /api/tasks`
- `GET /api/git-operations`

**Description:**
Endpoints return potentially large arrays without pagination. Example (line 990):
```javascript
const limit = parseInt(req.query.limit) || 50;
```

Limit is applied but no offset/cursor mechanism exists.

**Impact:**
- Large response payloads
- Poor performance
- Difficult data navigation

**Root Cause:**
No pagination implementation.

**Solution:**
Implement offset-based or cursor-based pagination.

**Code Fix:**
```javascript
// Pagination helper:
function paginate(array, page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const total = array.length;
  const totalPages = Math.ceil(total / limit);
  const data = array.slice(offset, offset + limit);

  return {
    data,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages,
      hasMore: page < totalPages
    }
  };
}

// Use in endpoints:
app.get('/api/events', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    if (limit > 1000) {
      throw new APIError('Limit cannot exceed 1000', 400);
    }

    const sessionOnly = req.query.session === 'current';
    let events = [];

    // ... load events ...

    const sortedEvents = events.sort((a, b) =>
      new Date(b.timestamp) - new Date(a.timestamp)
    );

    const result = paginate(sortedEvents, page, limit);

    res.set('X-Total-Count', result.pagination.total);
    res.set('X-Page', result.pagination.page);
    res.set('X-Total-Pages', result.pagination.totalPages);

    res.json(result);
  } catch (error) {
    next(error instanceof APIError ? error : new APIError('Internal server error', 500));
  }
});
```

---

### ISSUE #22: Blocking File Operations on Main Thread
**Severity:** MEDIUM
**Location:** Lines 2799, 2871, 2958, 3004, 3012

**Description:**
Several operations use synchronous `fsSync` methods in request handlers:
```javascript
const content = fsSync.readFileSync(FILES.dashboardEvents, 'utf-8');
```

This blocks the event loop, reducing server throughput.

**Impact:**
- Poor performance under load
- Blocked event loop
- Slow response times

**Root Cause:**
Use of sync file operations in async context.

**Solution:**
Replace all sync operations with async equivalents.

**Code Fix:**
```javascript
// OLD (lines 2798-2808):
eventWatcher.on('change', async () => {
  try {
    const fsSync = require('fs');
    if (fsSync.existsSync(FILES.dashboardEvents)) {
      const content = fsSync.readFileSync(FILES.dashboardEvents, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line);

      if (lines.length > 0) {
        const lastEvent = normalizeEvent(JSON.parse(lines[lines.length - 1]));
        console.log(`Dashboard event: ${lastEvent.type}`);
        broadcastEvent(lastEvent);
      }
    }
  } catch (error) {
    console.error('Error processing dashboard event:', error);
  }
});

// NEW:
eventWatcher.on('change', async () => {
  try {
    try {
      await fs.access(FILES.dashboardEvents);
    } catch {
      return; // File doesn't exist
    }

    const content = await fs.readFile(FILES.dashboardEvents, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line);

    if (lines.length > 0) {
      const lastEvent = normalizeEvent(JSON.parse(lines[lines.length - 1]));
      console.log(`Dashboard event: ${lastEvent.type}`);
      broadcastEvent(lastEvent);
    }
  } catch (error) {
    console.error('Error processing dashboard event:', error);
  }
});
```

Apply similar changes to all other `fsSync` usages in:
- Lines 2871 (ddqd history)
- Lines 2958, 3004, 3012 (ddqd schedule)
- Any other sync file operations

---

### ISSUE #23: No Caching Headers on API Responses
**Severity:** MEDIUM
**Endpoints Affected:** All GET endpoints

**Description:**
No cache control headers are set on responses. This can lead to unnecessary API calls and stale data being cached unintentionally.

**Impact:**
- Unnecessary server load
- Stale data in clients
- Poor performance

**Root Cause:**
No cache control middleware.

**Solution:**
Add appropriate cache headers based on endpoint type.

**Code Fix:**
```javascript
// Add cache control middleware:
function cacheControl(duration = 0, directive = 'no-cache') {
  return (req, res, next) => {
    if (duration === 0) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    } else {
      res.set('Cache-Control', `${directive}, max-age=${duration}`);
    }
    next();
  };
}

// Apply to endpoints:
// No caching for real-time data
app.get('/api/metrics', cacheControl(0), async (req, res, next) => { /* ... */ });
app.get('/api/workers', cacheControl(0), async (req, res, next) => { /* ... */ });
app.get('/api/events', cacheControl(0), async (req, res, next) => { /* ... */ });

// Short caching for semi-static data
app.get('/api/streams', cacheControl(60, 'public'), async (req, res, next) => { /* ... */ });
app.get('/api/git-info', cacheControl(30, 'public'), async (req, res, next) => { /* ... */ });

// Longer caching for historical data
app.get('/api/metrics/history', cacheControl(300, 'public'), async (req, res, next) => { /* ... */ });
```

---

### ISSUE #24: Poor Error Recovery in File Watchers
**Severity:** MEDIUM
**Location:** Lines 2721-2756, 2786-2812

**Description:**
File watchers don't handle errors comprehensively. If a watched file is deleted or becomes inaccessible, the watcher may fail silently.

**Impact:**
- Lost real-time updates
- Silent failures
- Confusing behavior

**Root Cause:**
Insufficient error handling in watchers.

**Solution:**
Add comprehensive error handling and recovery.

**Code Fix:**
```javascript
// OLD (lines 2721-2756):
const watcher = chokidar.watch(coordFiles, {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 150,
    pollInterval: 50
  }
});

watcher.on('change', async (filePath) => {
  console.log(`File changed: ${path.basename(filePath)}`);
  debouncedBroadcast(filePath);
});

// NEW:
const watcher = chokidar.watch(coordFiles, {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 150,
    pollInterval: 50
  }
});

watcher.on('change', async (filePath) => {
  console.log(`File changed: ${path.basename(filePath)}`);
  debouncedBroadcast(filePath);
});

watcher.on('error', (error) => {
  console.error('File watcher error:', error);
  // Attempt to restart watcher after delay
  setTimeout(() => {
    try {
      watcher.close();
      const newWatcher = chokidar.watch(coordFiles, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 150,
          pollInterval: 50
        }
      });
      console.log('File watcher restarted after error');
    } catch (restartError) {
      console.error('Failed to restart file watcher:', restartError);
    }
  }, 5000);
});

watcher.on('unlink', (filePath) => {
  console.warn(`Watched file deleted: ${path.basename(filePath)}`);
  // Notify clients
  clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({
        type: 'file_deleted',
        file: path.basename(filePath),
        timestamp: new Date().toISOString()
      }));
    }
  });
});
```

---

### ISSUE #25: No Health Check for Dependencies
**Severity:** MEDIUM
**Endpoint:** `GET /api/health`

**Description:**
Health check endpoint (lines 541-547) only checks if the server is running, not if dependencies (file system, disk space, etc.) are healthy.

**Impact:**
- False positive health checks
- Undetected system issues
- Poor monitoring

**Root Cause:**
Superficial health check.

**Solution:**
Implement comprehensive health checks.

**Code Fix:**
```javascript
// OLD (lines 541-547):
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// NEW:
app.get('/api/health', async (req, res) => {
  const checks = {
    server: { status: 'healthy' },
    memory: { status: 'healthy' },
    disk: { status: 'healthy' },
    files: { status: 'healthy' },
    dependencies: { status: 'healthy' }
  };

  let overallStatus = 'healthy';

  // Memory check
  const memUsage = process.memoryUsage();
  const memUsedMB = memUsage.heapUsed / 1024 / 1024;
  const memLimitMB = memUsage.heapTotal / 1024 / 1024;
  const memPercent = (memUsedMB / memLimitMB) * 100;

  checks.memory = {
    status: memPercent > 90 ? 'critical' : memPercent > 75 ? 'warning' : 'healthy',
    used_mb: Math.round(memUsedMB),
    limit_mb: Math.round(memLimitMB),
    percent: Math.round(memPercent)
  };

  if (checks.memory.status === 'critical') overallStatus = 'unhealthy';

  // Disk space check
  try {
    const diskSpace = await checkDiskSpace(__dirname);
    const diskPercent = ((diskSpace.size - diskSpace.free) / diskSpace.size) * 100;

    checks.disk = {
      status: diskPercent > 95 ? 'critical' : diskPercent > 85 ? 'warning' : 'healthy',
      free_gb: Math.round(diskSpace.free / 1024 / 1024 / 1024),
      total_gb: Math.round(diskSpace.size / 1024 / 1024 / 024),
      percent_used: Math.round(diskPercent)
    };

    if (checks.disk.status === 'critical') overallStatus = 'unhealthy';
  } catch (error) {
    checks.disk = { status: 'unknown', error: error.message };
  }

  // Critical files check
  const criticalFiles = [
    FILES.workerPool,
    FILES.tokenBudget,
    FILES.taskQueue
  ];

  const missingFiles = [];
  for (const file of criticalFiles) {
    try {
      await fs.access(file);
    } catch {
      missingFiles.push(path.basename(file));
    }
  }

  checks.files = {
    status: missingFiles.length > 0 ? 'critical' : 'healthy',
    missing: missingFiles
  };

  if (missingFiles.length > 0) overallStatus = 'unhealthy';

  // Dependencies check (WebSocket, file watchers)
  checks.dependencies = {
    websocket: wss && wss.clients ? 'healthy' : 'unhealthy',
    file_watcher: watcher ? 'healthy' : 'unhealthy',
    event_watcher: eventWatcher ? 'healthy' : 'unhealthy'
  };

  const statusCode = overallStatus === 'healthy' ? 200 : 503;

  res.status(statusCode).json({
    status: overallStatus,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks
  });
});
```

---

### ISSUE #26: No Logging/Audit Trail for Sensitive Operations
**Severity:** MEDIUM
**Endpoints Affected:**
- `POST /api/daemon/control`
- `POST /api/health-alerts/:id/restart-worker`
- `POST /api/event-log/purge`
- `DELETE /api/health-alerts/:id`

**Description:**
Sensitive operations aren't logged to an audit trail. Only console.log is used.

**Impact:**
- No accountability
- Difficult incident investigation
- Security compliance issues

**Root Cause:**
No audit logging system.

**Solution:**
Implement structured audit logging.

**Code Fix:**
```javascript
// Add audit logger:
async function auditLog(action, details, req) {
  const auditEntry = {
    timestamp: new Date().toISOString(),
    action,
    details,
    ip: req.ip || req.connection.remoteAddress,
    user_agent: req.headers['user-agent'],
    api_key: req.headers['x-api-key'] ? 'present' : 'absent'
  };

  const auditLogPath = path.join(COMMIT_RELAY_HOME, 'coordination', 'audit-log.jsonl');

  try {
    await fs.appendFile(
      auditLogPath,
      JSON.stringify(auditEntry) + '\n',
      'utf-8'
    );
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }

  console.log('AUDIT:', action, details);
}

// Use in sensitive endpoints:
app.post('/api/daemon/control', async (req, res, next) => {
  try {
    const { action } = req.body;

    await auditLog('daemon_control', { action, daemon: 'worker' }, req);

    // ... rest of handler
  } catch (error) {
    next(error);
  }
});

app.post('/api/event-log/purge', async (req, res) => {
  try {
    await auditLog('event_log_purge', { count: eventCount }, req);

    // ... rest of handler
  } catch (error) {
    next(error);
  }
});
```

---

### ISSUE #27: Inefficient Array Operations in Metrics Calculation
**Severity:** MEDIUM
**Location:** Lines 277-341

**Description:**
`calculateSuccessRate()` filters arrays multiple times unnecessarily:
```javascript
const completed = (workerPool.completed_workers || []).filter(isProductionWorker);
const failed = (workerPool.failed_workers || []).filter(isProductionWorker);
// Then filters again by time period
filteredCompleted = completed.filter(w => { /* time filter */ });
```

**Impact:**
- Poor performance with large datasets
- Unnecessary CPU usage
- Slow API responses

**Root Cause:**
Inefficient algorithm.

**Solution:**
Combine filters, use single pass where possible.

**Code Fix:**
```javascript
// OLD (lines 277-341):
function calculateSuccessRate(workerPool, period = 'all_time') {
  const now = Date.now();
  const completed = (workerPool.completed_workers || []).filter(isProductionWorker);
  const failed = (workerPool.failed_workers || []).filter(isProductionWorker);
  const active = (workerPool.active_workers || []).filter(isProductionWorker);

  let filteredCompleted = [];
  let filteredFailed = [];
  let filteredActive = [];

  switch (period) {
    case 'last_24h':
      const day_ago = now - (24 * 60 * 60 * 1000);
      filteredCompleted = completed.filter(w => {
        const completedAt = new Date(w.completed_at).getTime();
        return completedAt >= day_ago;
      });
      // ... more filters
  }
  // ...
}

// NEW:
function calculateSuccessRate(workerPool, period = 'all_time') {
  const now = Date.now();

  // Single-pass filtering
  const filtered = {
    completed: [],
    failed: [],
    active: []
  };

  // Time filter function
  const getTimeFilter = () => {
    switch (period) {
      case 'last_24h':
        const dayAgo = now - (24 * 60 * 60 * 1000);
        return (timestamp) => new Date(timestamp).getTime() >= dayAgo;
      case 'last_7d':
        const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
        return (timestamp) => new Date(timestamp).getTime() >= weekAgo;
      case 'current_run':
        return () => true; // Handled separately
      case 'all_time':
      default:
        return () => true;
    }
  };

  const timeFilter = getTimeFilter();

  // Single pass through completed workers
  (workerPool.completed_workers || []).forEach(w => {
    if (isProductionWorker(w) && timeFilter(w.completed_at)) {
      filtered.completed.push(w);
    }
  });

  // Single pass through failed workers
  (workerPool.failed_workers || []).forEach(w => {
    if (isProductionWorker(w) && timeFilter(w.completed_at || w.failed_at)) {
      filtered.failed.push(w);
    }
  });

  // Active workers (for current_run)
  if (period === 'current_run') {
    (workerPool.active_workers || []).forEach(w => {
      if (isProductionWorker(w) && (w.status === 'running' || w.status === 'active')) {
        filtered.active.push(w);
      }
    });
  }

  const totalCompleted = filtered.completed.length;
  const totalFailed = filtered.failed.length;
  const totalActive = filtered.active.length;
  const total = totalCompleted + totalFailed + totalActive;

  const rate = total > 0 ? ((totalCompleted / total) * 100).toFixed(1) : 0;

  return {
    rate: parseFloat(rate),
    completed: totalCompleted,
    failed: totalFailed,
    active: totalActive,
    total: total,
    period: period
  };
}
```

---

### ISSUE #28: No Compression for Large Responses
**Severity:** MEDIUM
**Location:** Server configuration

**Description:**
No response compression is configured. Large JSON responses (workers, events, history) waste bandwidth.

**Impact:**
- Slow response times
- High bandwidth usage
- Poor performance on slow connections

**Root Cause:**
No compression middleware.

**Solution:**
Add gzip/brotli compression.

**Code Fix:**
```javascript
// Add after imports:
const compression = require('compression');

// Add after CORS (line 21):
// Enable compression for responses
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6, // Compression level (1-9, 6 is good balance)
  threshold: 1024 // Only compress responses > 1KB
}));
```

---

### ISSUE #29: Unbounded Query String Parameters
**Severity:** MEDIUM
**Endpoints Affected:** `GET /api/events`, `GET /api/git-operations`

**Description:**
The `limit` parameter can be set extremely high:
```javascript
const limit = parseInt(req.query.limit) || 50;
```

No maximum validation. Users could request millions of records.

**Impact:**
- Memory exhaustion
- Slow queries
- DOS potential

**Root Cause:**
No max limit validation.

**Solution:**
Enforce maximum limits.

**Code Fix:**
```javascript
// Add constant at top:
const MAX_QUERY_LIMIT = 1000;

// Update endpoints:
app.get('/api/events', async (req, res, next) => {
  try {
    let limit = parseInt(req.query.limit) || 50;

    // Enforce maximum
    if (limit > MAX_QUERY_LIMIT) {
      limit = MAX_QUERY_LIMIT;
      console.warn(`Limit capped at ${MAX_QUERY_LIMIT} for ${req.ip}`);
    }

    if (limit < 1) {
      throw new APIError('Limit must be at least 1', 400);
    }

    // ... rest of handler
  } catch (error) {
    next(error);
  }
});
```

---

## LOW Severity Issues

### ISSUE #30: Missing JSDoc Documentation
**Severity:** LOW
**Location:** Throughout file

**Description:**
Many functions lack JSDoc documentation. Some have it (like `readJSON` at line 54), but many don't (like helpers `getLastCommitInfo` at line 1580).

**Impact:**
- Poor code maintainability
- Difficult onboarding
- Unclear API contracts

**Root Cause:**
Inconsistent documentation standards.

**Solution:**
Add comprehensive JSDoc to all functions.

**Code Fix:**
```javascript
/**
 * Get information about the last git commit
 * @returns {{message: string, timeAgo: string}} Commit message and relative time
 */
function getLastCommitInfo() {
  // ... implementation
}

/**
 * Validate query parameters against schema
 * @param {Object} req - Express request object
 * @param {Object} schema - Validation schema
 * @returns {string[]} Array of validation errors (empty if valid)
 */
function validateQueryParams(req, schema) {
  // ... implementation
}

/**
 * Safely join paths and verify result is within base directory
 * Prevents path traversal attacks
 * @param {string} baseDir - Base directory path
 * @param {...string} parts - Path parts to join
 * @returns {string} Safely joined path
 * @throws {Error} If path traversal detected
 */
function safePathJoin(baseDir, ...parts) {
  // ... implementation
}
```

---

### ISSUE #31: Inconsistent Naming Conventions
**Severity:** LOW
**Location:** Throughout file

**Description:**
Inconsistent naming between:
- `worker_id` vs `workerId`
- `task_id` vs `taskId`
- `completed_at` vs `completedAt`
- `health_alerts` vs `healthAlerts`

**Impact:**
- Code confusion
- Maintenance difficulty
- Bugs from naming mismatches

**Root Cause:**
No enforced naming convention.

**Solution:**
Standardize on snake_case for data/API, camelCase for JavaScript.

**Code Fix:**
```javascript
// Create normalizer helpers:
function toSnakeCase(obj) {
  if (Array.isArray(obj)) {
    return obj.map(toSnakeCase);
  }

  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      acc[snakeKey] = toSnakeCase(obj[key]);
      return acc;
    }, {});
  }

  return obj;
}

function toCamelCase(obj) {
  if (Array.isArray(obj)) {
    return obj.map(toCamelCase);
  }

  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
      acc[camelKey] = toCamelCase(obj[key]);
      return acc;
    }, {});
  }

  return obj;
}

// Use middleware to normalize:
app.use((req, res, next) => {
  // Convert request body to camelCase for internal use
  if (req.body && typeof req.body === 'object') {
    req.body = toCamelCase(req.body);
  }
  next();
});

// Wrap res.json to convert back to snake_case for API responses
const originalJson = res.json.bind(res);
res.json = function(data) {
  return originalJson(toSnakeCase(data));
};
```

---

### ISSUE #32: No API Versioning
**Severity:** LOW
**Location:** All endpoints

**Description:**
No API versioning strategy. All endpoints are at `/api/*` with no version prefix.

**Impact:**
- Difficult to make breaking changes
- Poor backward compatibility
- API evolution challenges

**Root Cause:**
No versioning design.

**Solution:**
Implement API versioning (URL prefix or header-based).

**Code Fix:**
```javascript
// Option 1: URL prefix versioning
// Keep current endpoints under /api/v1
const v1Router = express.Router();

// Move all current routes to v1Router
v1Router.get('/metrics', async (req, res, next) => { /* ... */ });
v1Router.get('/workers', async (req, res, next) => { /* ... */ });
// ... all other routes

app.use('/api/v1', v1Router);

// Redirect /api/* to /api/v1/* for backward compatibility
app.use('/api', (req, res, next) => {
  if (!req.path.startsWith('/v1')) {
    res.redirect(308, `/api/v1${req.path}`);
  } else {
    next();
  }
});

// Option 2: Header-based versioning
app.use((req, res, next) => {
  const apiVersion = req.headers['api-version'] || '1';
  req.apiVersion = apiVersion;
  res.set('API-Version', apiVersion);
  next();
});
```

---

## Summary of Fixes Priority

### Immediate (Critical - Apply within 24 hours)
1. Add authentication/authorization (Issue #1)
2. Fix command injection vulnerabilities (Issues #2, #3)
3. Fix path traversal vulnerability (Issue #4)
4. Add rate limiting (Issue #5)
5. Add request body size limits (Issue #6)
6. Implement file operation locking (Issue #7)
7. Fix error information disclosure (Issue #8)

### Short-term (High - Apply within 1 week)
1. Add comprehensive input validation (Issues #9, #10, #11)
2. Add process timeouts (Issue #12)
3. Fix memory leaks (Issues #13, #14)
4. Fix unsafe shell commands (Issue #15)
5. Add request timeouts (Issue #16)
6. Standardize error responses (Issue #17)
7. Fix CORS configuration (Issue #18)
8. Add file write validation (Issue #19)
9. Authenticate WebSocket connections (Issue #20)

### Medium-term (Medium - Apply within 2-4 weeks)
1. Implement pagination (Issue #21)
2. Replace sync file operations (Issue #22)
3. Add caching headers (Issue #23)
4. Improve file watcher error handling (Issue #24)
5. Enhance health check (Issue #25)
6. Add audit logging (Issue #26)
7. Optimize metrics calculations (Issue #27)
8. Add response compression (Issue #28)
9. Enforce query limits (Issue #29)

### Low Priority (Low - Apply during refactoring)
1. Add JSDoc documentation (Issue #30)
2. Standardize naming conventions (Issue #31)
3. Implement API versioning (Issue #32)

---

## Testing Recommendations

After applying fixes, perform these tests:

1. **Security Testing**
   - Penetration testing with tools like OWASP ZAP
   - Authentication bypass attempts
   - Command injection tests
   - Path traversal tests
   - Rate limit verification

2. **Performance Testing**
   - Load testing with tools like Artillery or k6
   - Memory leak detection (run for 24+ hours)
   - Response time benchmarking
   - Compression effectiveness

3. **Functional Testing**
   - All endpoints with valid/invalid inputs
   - WebSocket connection/disconnection
   - File watcher behavior
   - Error handling paths

4. **Integration Testing**
   - End-to-end API workflows
   - Daemon control operations
   - DDQD test lifecycle
   - Health alert workflows

---

## Additional Recommendations

1. **Add Monitoring**
   - APM tool (New Relic, DataDog, or open-source like Prometheus)
   - Error tracking (Sentry)
   - Performance metrics
   - Security event logging

2. **Implement CI/CD Checks**
   - ESLint with security rules
   - Dependency vulnerability scanning (npm audit, Snyk)
   - API contract testing
   - Security scanning in CI pipeline

3. **Documentation**
   - OpenAPI/Swagger specification
   - Authentication guide
   - Rate limiting documentation
   - Error code reference

4. **Configuration Management**
   - Move all hardcoded values to environment variables
   - Configuration validation on startup
   - Secure credential storage

---

## Conclusion

This API review identified **32 distinct issues** ranging from critical security vulnerabilities to minor code quality concerns. The most severe issues involve:

- Complete lack of authentication/authorization
- Command injection vulnerabilities
- Path traversal risks
- Missing input validation
- Race conditions in file operations

**Estimated Fix Effort:**
- Critical fixes: 16-24 hours
- High priority fixes: 32-40 hours
- Medium priority fixes: 24-32 hours
- Low priority fixes: 8-16 hours
- **Total: 80-112 hours (2-3 weeks of focused development)**

**Risk Assessment:**
Without fixes, the system is vulnerable to:
- Unauthorized system control
- Data breaches
- Denial of service attacks
- System compromise
- Data corruption

**Recommended Action:**
Prioritize critical and high severity issues immediately. The authentication and input validation issues pose significant security risks and should be addressed within the next sprint.
