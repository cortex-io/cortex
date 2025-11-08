# API Fixes Implementation Checklist
**Task:** task-1762553438
**Generated:** 2025-11-08

This checklist provides a step-by-step guide for implementing all API fixes identified in the comprehensive review.

---

## Phase 1: Critical Security Fixes (Week 1)

### Setup: Install Required Dependencies
```bash
cd /Users/ryandahlberg/projects/commit-relay/dashboard
npm install --save express-rate-limit proper-lockfile joi connect-timeout
```

### Fix #1: Authentication & Authorization
- [ ] Add API key authentication middleware
- [ ] Add write access authorization middleware
- [ ] Update CORS configuration with restricted origins
- [ ] Add body size limits to express.json()
- [ ] Test: Verify unauthenticated requests are rejected
- [ ] Test: Verify authenticated requests work
- [ ] **File:** `/Users/ryandahlberg/projects/commit-relay/dashboard/server/index.js` (lines 20-23)
- [ ] **Estimated time:** 8 hours

### Fix #2-3: Command Injection Prevention
- [ ] Replace execSync with spawn in daemon control endpoints
- [ ] Add input validation for action parameter
- [ ] Add worker ID format validation
- [ ] Add safe path validation
- [ ] Test: Verify daemons start/stop correctly
- [ ] Test: Attempt injection with special characters
- [ ] **Files:** Lines 1791-1903 (worker daemon), 1843-1903 (PM daemon), 1944-1993 (health daemon), 2034-2083 (metrics daemon)
- [ ] **Estimated time:** 4 hours

### Fix #4: Path Traversal Protection
- [ ] Implement safePathJoin() helper function
- [ ] Add worker ID validation (alphanumeric + hyphens/underscores only)
- [ ] Update restart-worker endpoint to use safe path operations
- [ ] Test: Attempt path traversal with ../../../etc/passwd
- [ ] Test: Verify legitimate worker IDs work
- [ ] **File:** Lines 1220-1327
- [ ] **Estimated time:** 2 hours

### Fix #5: Rate Limiting
- [ ] Install express-rate-limit package
- [ ] Configure general API rate limiter (100/min)
- [ ] Configure strict limiter for destructive ops (10/5min)
- [ ] Configure DDQD test limiter (5/hour)
- [ ] Apply limiters to appropriate routes
- [ ] Test: Verify rate limits trigger correctly
- [ ] Test: Verify limits reset after window
- [ ] **File:** After line 23
- [ ] **Estimated time:** 3 hours

### Fix #6: Request Size Limits
- [ ] Add limit to express.json() (1MB)
- [ ] Add limit to express.urlencoded() (1MB)
- [ ] Test: Send 10MB JSON payload (should reject)
- [ ] Test: Send valid payload (should accept)
- [ ] **File:** Line 22
- [ ] **Estimated time:** 30 minutes

### Fix #7: File Operation Race Conditions
- [ ] Install proper-lockfile package
- [ ] Implement atomicFileUpdate() helper
- [ ] Update health alert resolve endpoint
- [ ] Update health alert note endpoint
- [ ] Update health alert delete endpoint
- [ ] Update event log purge endpoint
- [ ] Test: Send concurrent updates to same alert
- [ ] Test: Verify all updates are preserved
- [ ] **Files:** Lines 1167-1217, 1333-1384, 1390-1429, 1741-1786
- [ ] **Estimated time:** 6 hours

### Fix #8: Error Information Disclosure
- [ ] Implement APIError class
- [ ] Add centralized error handler middleware
- [ ] Add 404 handler for undefined routes
- [ ] Update all endpoints to use APIError
- [ ] Remove detailed error messages from responses
- [ ] Test: Trigger errors and verify generic messages
- [ ] Test: Verify errors logged server-side
- [ ] **File:** Before line 3072
- [ ] **Estimated time:** 2 hours

---

## Phase 2: Input Validation & Reliability (Week 2)

### Fix #9: Query Parameter Validation
- [ ] Implement validateQueryParams() helper
- [ ] Update /api/metrics with validation
- [ ] Update /api/metrics/history with validation
- [ ] Update /api/events with validation
- [ ] Update /api/git-operations with validation
- [ ] Test: Send invalid period values
- [ ] Test: Send negative/huge limits
- [ ] **Files:** Lines 555-573, 582-698, 990-1028, 1038-1082
- [ ] **Estimated time:** 4 hours

### Fix #10: Request Body Validation
- [ ] Install Joi package
- [ ] Define validation schemas (daemonControl, alertNote, ddqdRun, ddqdSchedule)
- [ ] Implement validate() middleware
- [ ] Apply to daemon control endpoints
- [ ] Apply to health alert endpoints
- [ ] Apply to DDQD endpoints
- [ ] Test: Send invalid payloads
- [ ] Test: Verify validation error messages
- [ ] **Files:** Various POST endpoints
- [ ] **Estimated time:** 8 hours

### Fix #11: Path Parameter Validation
- [ ] Implement validatePathParam() middleware
- [ ] Apply to health alert endpoints (:id)
- [ ] Apply to DDQD endpoints (:testId)
- [ ] Test: Send invalid ID formats
- [ ] Test: Verify valid formats work
- [ ] **Files:** Lines 1167+, 2899+, 2931+
- [ ] **Estimated time:** 2 hours

### Fix #12: Process Timeouts
- [ ] Add timeout mechanism to DDQD test spawning
- [ ] Add timeout cleanup on process close
- [ ] Test: Start DDQD test and wait for timeout
- [ ] Test: Verify timeout kills process
- [ ] **File:** Lines 2820-2896
- [ ] **Estimated time:** 2 hours

### Fix #13: Event Buffer Memory Leak
- [ ] Implement cleanEventBuffer() function
- [ ] Add periodic buffer cleanup
- [ ] Update broadcastEvent() to call cleanup
- [ ] Test: Run with no clients for hours
- [ ] Test: Verify buffer doesn't grow unbounded
- [ ] **Files:** Lines 48-50, 2765-2783
- [ ] **Estimated time:** 2 hours

### Fix #14: DDQD Tests Memory Leak
- [ ] Add MAX_DDQD_TESTS constant
- [ ] Implement cleanupOldDDQDTests() function
- [ ] Add periodic cleanup interval
- [ ] Remove setTimeout cleanup in process close
- [ ] Add cleanup to shutdown handlers
- [ ] Test: Create 100 tests and verify old ones cleaned
- [ ] Test: Verify cleanup on shutdown
- [ ] **Files:** Lines 2818, 2884-2886, 3076+
- [ ] **Estimated time:** 2 hours

### Fix #15: Unsafe Shell Commands (jq)
- [ ] Implement safeJqParse() helper using spawn
- [ ] Update /api/moe/routing endpoint
- [ ] Update /api/moe/accuracy endpoint
- [ ] Update /api/moe/confidence-distribution endpoint
- [ ] Test: Verify jq parsing works correctly
- [ ] Test: Attempt injection via file paths
- [ ] **Files:** Lines 2093-2119, 2247-2304, 2310-2381
- [ ] **Estimated time:** 3 hours

### Fix #16: Request Timeouts
- [ ] Install connect-timeout package
- [ ] Add timeout middleware (30s)
- [ ] Add timeout error handler
- [ ] Test: Create slow endpoint, verify timeout
- [ ] **File:** After line 23
- [ ] **Estimated time:** 1 hour

### Fix #17: Standardize Error Responses
- [ ] Update APIError.toJSON() method
- [ ] Implement successResponse() helper
- [ ] Update all endpoints to use helpers
- [ ] Test: Verify consistent response format
- [ ] **Files:** Throughout
- [ ] **Estimated time:** 4 hours

### Fix #18: CORS Preflight Handling
- [ ] Update CORS configuration with full options
- [ ] Add explicit OPTIONS handler
- [ ] Test: Send preflight OPTIONS request
- [ ] Test: Verify CORS headers present
- [ ] **File:** Line 21
- [ ] **Estimated time:** 1 hour

### Fix #19: File Write Validation
- [ ] Install check-disk-space package
- [ ] Implement safeFileWrite() helper
- [ ] Update all file write operations
- [ ] Test: Verify disk space check works
- [ ] Test: Attempt write outside allowed dirs
- [ ] **Files:** Various endpoints writing files
- [ ] **Estimated time:** 4 hours

### Fix #20: WebSocket Authentication
- [ ] Update WebSocket connection handler
- [ ] Extract and validate token from URL/headers
- [ ] Close unauthorized connections
- [ ] Test: Connect without token (should reject)
- [ ] Test: Connect with valid token (should accept)
- [ ] **File:** Lines 2582-2642
- [ ] **Estimated time:** 2 hours

---

## Phase 3: Performance & Features (Weeks 3-4)

### Fix #21: Pagination
- [ ] Implement paginate() helper
- [ ] Update /api/events endpoint
- [ ] Update /api/workers endpoint
- [ ] Update /api/tasks endpoint
- [ ] Update /api/git-operations endpoint
- [ ] Add pagination headers (X-Total-Count, X-Page, etc.)
- [ ] Test: Verify pagination works correctly
- [ ] Test: Navigate through pages
- [ ] **Files:** Lines 990+, 741+, 919+, 1038+
- [ ] **Estimated time:** 8 hours

### Fix #22: Async File Operations
- [ ] Replace fsSync.existsSync with fs.access
- [ ] Replace fsSync.readFileSync with fs.readFile
- [ ] Replace fsSync.writeFileSync with fs.writeFile
- [ ] Update event watcher handler
- [ ] Update DDQD history/schedule endpoints
- [ ] Test: Verify no blocking operations
- [ ] Test: Performance under load
- [ ] **Files:** Lines 2799, 2871, 2958, 3004, 3012
- [ ] **Estimated time:** 8 hours

### Fix #23: Caching Headers
- [ ] Implement cacheControl() middleware
- [ ] Apply no-cache to real-time endpoints
- [ ] Apply short cache to semi-static endpoints
- [ ] Apply longer cache to historical endpoints
- [ ] Test: Verify cache headers in responses
- [ ] **Files:** All GET endpoints
- [ ] **Estimated time:** 4 hours

### Fix #24: File Watcher Error Handling
- [ ] Add error handler to coordination file watcher
- [ ] Add error handler to event watcher
- [ ] Implement watcher restart logic
- [ ] Add unlink handler for deleted files
- [ ] Test: Delete watched file and verify handling
- [ ] Test: Verify watcher restarts after error
- [ ] **Files:** Lines 2721-2756, 2786-2812
- [ ] **Estimated time:** 4 hours

### Fix #25: Enhanced Health Check
- [ ] Update /api/health endpoint
- [ ] Add memory usage check
- [ ] Add disk space check
- [ ] Add critical files check
- [ ] Add dependencies check
- [ ] Test: Verify comprehensive health report
- [ ] Test: Trigger unhealthy states
- [ ] **File:** Lines 541-547
- [ ] **Estimated time:** 4 hours

### Fix #26: Audit Logging
- [ ] Implement auditLog() function
- [ ] Add audit logging to daemon control endpoints
- [ ] Add audit logging to health alert operations
- [ ] Add audit logging to event log purge
- [ ] Test: Verify audit log entries created
- [ ] Test: Review audit log format
- [ ] **Files:** All sensitive operation endpoints
- [ ] **Estimated time:** 6 hours

### Fix #27: Optimize Metrics Calculation
- [ ] Refactor calculateSuccessRate() for single-pass filtering
- [ ] Combine time and production worker filters
- [ ] Test: Verify same results as before
- [ ] Benchmark: Compare performance improvement
- [ ] **File:** Lines 277-341
- [ ] **Estimated time:** 3 hours

### Fix #28: Response Compression
- [ ] Install compression package
- [ ] Add compression middleware
- [ ] Configure compression options
- [ ] Test: Verify gzip encoding in responses
- [ ] Test: Measure bandwidth reduction
- [ ] **File:** After line 21
- [ ] **Estimated time:** 2 hours

### Fix #29: Query Limit Enforcement
- [ ] Add MAX_QUERY_LIMIT constant
- [ ] Update /api/events to enforce max
- [ ] Update /api/git-operations to enforce max
- [ ] Test: Request limit > 1000 (should cap)
- [ ] Test: Verify warning logged
- [ ] **Files:** Lines 990, 1040
- [ ] **Estimated time:** 1 hour

---

## Phase 4: Code Quality (Ongoing)

### Fix #30: JSDoc Documentation
- [ ] Add JSDoc to all public functions
- [ ] Add JSDoc to all API endpoints
- [ ] Add JSDoc to helper functions
- [ ] Generate documentation with JSDoc tool
- [ ] **Files:** Throughout
- [ ] **Estimated time:** 8 hours

### Fix #31: Naming Consistency
- [ ] Implement toSnakeCase() helper
- [ ] Implement toCamelCase() helper
- [ ] Add request/response normalization middleware
- [ ] Test: Verify naming consistency
- [ ] **Files:** Throughout
- [ ] **Estimated time:** 4 hours

### Fix #32: API Versioning
- [ ] Create v1 router
- [ ] Move all routes to v1 router
- [ ] Add /api/* redirect to /api/v1/*
- [ ] OR: Implement header-based versioning
- [ ] Test: Verify backward compatibility
- [ ] **File:** Before route definitions
- [ ] **Estimated time:** 4 hours

---

## Testing Checklist

### Security Tests
- [ ] Authentication tests (valid/invalid API keys)
- [ ] Authorization tests (read vs write operations)
- [ ] Command injection tests
- [ ] Path traversal tests
- [ ] Rate limiting tests
- [ ] Input fuzzing tests
- [ ] OWASP ZAP scan

### Performance Tests
- [ ] Load test: 100 concurrent connections
- [ ] Load test: 1000 requests/minute
- [ ] Memory leak test: 24-hour soak
- [ ] Response time benchmarks
- [ ] Compression effectiveness
- [ ] Cache header verification

### Functional Tests
- [ ] All endpoints with valid inputs
- [ ] All endpoints with invalid inputs
- [ ] WebSocket connection lifecycle
- [ ] File watcher triggers
- [ ] Daemon control operations
- [ ] DDQD test lifecycle
- [ ] Health alert workflows
- [ ] Error handling paths

### Integration Tests
- [ ] End-to-end workflows
- [ ] Multi-client WebSocket scenarios
- [ ] Concurrent request handling
- [ ] File operation atomicity
- [ ] Graceful shutdown

---

## Deployment Checklist

### Pre-Deployment
- [ ] All critical fixes applied
- [ ] All high priority fixes applied
- [ ] Security tests passed
- [ ] Performance tests passed
- [ ] Code review completed
- [ ] Documentation updated

### Environment Configuration
- [ ] Set DASHBOARD_API_KEY environment variable
- [ ] Set DASHBOARD_WRITE_KEY environment variable
- [ ] Set DASHBOARD_WS_TOKEN environment variable
- [ ] Set DASHBOARD_ALLOWED_ORIGINS environment variable
- [ ] Set NODE_ENV=production

### Deployment Steps
- [ ] Backup current server code
- [ ] Deploy updated code
- [ ] Restart dashboard server
- [ ] Verify health check endpoint
- [ ] Monitor logs for errors
- [ ] Test key endpoints
- [ ] Monitor performance metrics

### Post-Deployment
- [ ] Monitor error rates
- [ ] Monitor response times
- [ ] Review audit logs
- [ ] Check rate limit hits
- [ ] Verify no memory leaks
- [ ] Schedule security audit

---

## Time Estimates Summary

| Phase | Estimated Hours |
|-------|----------------|
| Phase 1: Critical Security | 25.5 hours |
| Phase 2: Validation & Reliability | 35 hours |
| Phase 3: Performance & Features | 32 hours |
| Phase 4: Code Quality | 16 hours |
| Testing | 16 hours |
| **Total** | **124.5 hours** |

---

## Priority Order for Implementation

If time is limited, implement in this order:

1. Authentication (#1) - 8 hours
2. Command Injection (#2-3) - 4 hours
3. Rate Limiting (#5) - 3 hours
4. Path Traversal (#4) - 2 hours
5. File Locking (#7) - 6 hours
6. Error Disclosure (#8) - 2 hours
7. Input Validation (#9-11) - 14 hours
8. Memory Leaks (#13-14) - 4 hours
9. Process Timeouts (#12) - 2 hours
10. Everything else as time permits

**Minimum viable security: First 6 items = 25 hours**

---

## Support & References

- **Full Review:** `/Users/ryandahlberg/projects/commit-relay/docs/api-review-task-1762553438.md`
- **Executive Summary:** `/Users/ryandahlberg/projects/commit-relay/docs/api-review-executive-summary.md`
- **This Checklist:** `/Users/ryandahlberg/projects/commit-relay/docs/api-fixes-checklist.md`

For questions or clarifications, refer to the full review document which includes detailed explanations and complete code examples for each fix.
