import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { metricsHandler } from './metrics-exporter.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CORTEX_ROOT = path.join(__dirname, '..', '..')

const app = express()
const PORT = 3004

app.use(cors())
app.use(express.json())

// Prometheus metrics endpoint
app.get('/metrics', metricsHandler)

// Helper to read JSON files
const readJSON = (filePath) => {
  try {
    const fullPath = path.join(CORTEX_ROOT, filePath)
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'))
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message)
    return null
  }
}

// Helper to read JSONL files
const readJSONL = (filePath, limit = 100) => {
  try {
    const fullPath = path.join(CORTEX_ROOT, filePath)
    const content = fs.readFileSync(fullPath, 'utf8')
    return content
      .split('\n')
      .filter(line => line.trim())
      .slice(-limit)
      .map(line => JSON.parse(line))
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message)
    return []
  }
}

// Workers endpoint
app.get('/api/workers', (req, res) => {
  const workerPool = readJSON('coordination/worker-pool.json')
  res.json(workerPool || { active_workers: [], completed_workers: [], failed_workers: [] })
})

// Token budget endpoint
app.get('/api/token-budget', (req, res) => {
  const tokenBudget = readJSON('coordination/token-budget.json')
  res.json(tokenBudget || { total: 500000, allocated: 0, available: 500000 })
})

// Tasks endpoint
app.get('/api/tasks', (req, res) => {
  const taskQueue = readJSON('coordination/task-queue.json')
  res.json(taskQueue || { tasks: [] })
})

// Metrics endpoint (aggregate from multiple sources)
app.get('/api/metrics', (req, res) => {
  const workerPool = readJSON('coordination/worker-pool.json') || {}
  const taskQueue = readJSON('coordination/task-queue.json') || {}
  const tokenBudget = readJSON('coordination/token-budget.json') || {}

  const metrics = {
    active_workers: workerPool.active_workers?.length || 0,
    total_tasks: taskQueue.tasks?.length || 0,
    completed_tasks: taskQueue.tasks?.filter(t => t.status === 'completed').length || 0,
    success_rate: workerPool.stats?.success_rate || 0,
    tokens_available: tokenBudget.available || 0,
    tokens_allocated: tokenBudget.allocated || 0,
    tokens_total: tokenBudget.total || 500000
  }

  res.json(metrics)
})

// Health endpoint
app.get('/api/health', (req, res) => {
  const workerPool = readJSON('coordination/worker-pool.json') || {}
  const activeWorkers = workerPool.active_workers?.length || 0
  const failedWorkers = workerPool.failed_workers?.length || 0

  let status = 'healthy'
  if (failedWorkers > 0) status = 'degraded'
  if (activeWorkers === 0 && failedWorkers > 5) status = 'critical'

  res.json({
    status,
    active_workers: activeWorkers,
    failed_workers: failedWorkers,
    timestamp: new Date().toISOString()
  })
})

// Dashboard analytics summary
app.get('/api/dashboard/analytics/summary', (req, res) => {
  const workerPool = readJSON('coordination/worker-pool.json') || {}
  const tokenBudget = readJSON('coordination/token-budget.json') || {}

  res.json({
    kpis: {
      active_workers: workerPool.active_workers?.length || 0,
      success_rate: workerPool.stats?.success_rate || 0,
      tokens_available: tokenBudget.available || 0
    },
    trends: {
      workers_7d: [],
      tasks_7d: []
    }
  })
})

// Logs stream endpoint (SSE)
app.get('/api/logs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const sendLog = () => {
    const log = {
      timestamp: new Date().toISOString(),
      level: ['info', 'warn', 'error'][Math.floor(Math.random() * 3)],
      message: `Sample log message from Cortex system`,
      source: 'cortex-api'
    }
    res.write(`data: ${JSON.stringify(log)}\n\n`)
  }

  const interval = setInterval(sendLog, 5000)
  sendLog() // Send immediately

  req.on('close', () => {
    clearInterval(interval)
    res.end()
  })
})

// Optimizer endpoints
app.get('/api/optimizer/scheduler/stats', (req, res) => {
  const taskQueue = readJSON('coordination/task-queue.json') || {}
  res.json({
    queue_size: taskQueue.tasks?.filter(t => t.status === 'pending').length || 0,
    processing_rate: 5,
    token_usage_percent: 45
  })
})

app.get('/api/optimizer/tokens/forecast', (req, res) => {
  res.json({
    estimated_completion: '2 hours',
    bottlenecks: []
  })
})

// MoE Analytics endpoints
app.get('/api/moe/accuracy', (req, res) => {
  const decisions = readJSONL('coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl', 50)
  res.json({
    accuracy_over_time: decisions.map((d, i) => ({
      timestamp: d.timestamp,
      accuracy: 0.85 + (Math.random() * 0.1)
    }))
  })
})

app.get('/api/moe/confidence-distribution', (req, res) => {
  res.json({
    distribution: [
      { range: '0-20%', count: 2 },
      { range: '20-40%', count: 5 },
      { range: '40-60%', count: 15 },
      { range: '60-80%', count: 30 },
      { range: '80-100%', count: 48 }
    ]
  })
})

// Users endpoint (mock data)
app.get('/api/users', (req, res) => {
  res.json([
    { id: 1, name: 'Admin', email: 'admin@cortex.ai', role: 'admin', status: 'active' },
    { id: 2, name: 'Coordinator Master', email: 'coordinator@cortex.ai', role: 'master', status: 'active' },
    { id: 3, name: 'Development Master', email: 'dev@cortex.ai', role: 'master', status: 'active' }
  ])
})

// Execution Managers
app.get('/api/execution-managers', (req, res) => {
  res.json({
    active: [],
    completed: []
  })
})

// Microsoft Graph MCP Server endpoints
app.get('/api/microsoft-graph/health', (req, res) => {
  const healthChecks = readJSONL('coordination/monitoring/msgraph-health-checks.jsonl', 10)
  const latestCheck = healthChecks.length > 0 ? healthChecks[healthChecks.length - 1] : null

  res.json({
    status: latestCheck?.overall_status || 'unknown',
    health_score: latestCheck?.health_score || 0,
    checks_passed: latestCheck?.checks_passed || 0,
    checks_total: latestCheck?.checks_total || 0,
    last_check: latestCheck?.timestamp || null,
    history: healthChecks
  })
})

app.get('/api/microsoft-graph/metrics', (req, res) => {
  const monitoringConfig = readJSON('coordination/monitoring/microsoft-graph-mcp-server.json')
  const events = readJSONL('coordination/dashboard-events.jsonl', 100)

  // Filter MS Graph related events
  const graphEvents = events.filter(e =>
    e.source === 'health_check' ||
    e.event?.includes('msgraph') ||
    e.event?.includes('m365')
  )

  // Calculate metrics
  const authSuccessEvents = graphEvents.filter(e => e.event === 'msgraph_auth_success').length
  const authFailureEvents = graphEvents.filter(e => e.event === 'msgraph_auth_failure').length
  const totalAuthAttempts = authSuccessEvents + authFailureEvents
  const authSuccessRate = totalAuthAttempts > 0 ? (authSuccessEvents / totalAuthAttempts) * 100 : 0

  const apiAvailableEvents = graphEvents.filter(e => e.event === 'msgraph_api_available').length
  const apiUnavailableEvents = graphEvents.filter(e => e.event === 'msgraph_api_unavailable').length
  const totalApiChecks = apiAvailableEvents + apiUnavailableEvents
  const apiAvailability = totalApiChecks > 0 ? (apiAvailableEvents / totalApiChecks) * 100 : 0

  res.json({
    auth_success_rate: Math.round(authSuccessRate),
    api_availability: Math.round(apiAvailability),
    total_auth_attempts: totalAuthAttempts,
    total_api_checks: totalApiChecks,
    recent_events: graphEvents.slice(-20),
    monitoring_enabled: monitoringConfig?.monitoring_config?.enabled || false,
    dashboard_widget: monitoringConfig?.monitoring_config?.observability?.dashboard_widget || {}
  })
})

app.get('/api/microsoft-graph/security', (req, res) => {
  const securityTask = readJSON('coordination/tasks/microsoft-graph-security-scan.json')

  res.json({
    scan_status: securityTask?.status || 'unknown',
    priority: securityTask?.priority || 'unknown',
    focus_areas: securityTask?.scan_config?.focus_areas || [],
    compliance_checks: securityTask?.compliance_checks || {},
    security_notes: securityTask?.security_notes || {},
    last_scan: securityTask?.last_scan_date || null
  })
})

app.get('/api/microsoft-graph/m365-stats', (req, res) => {
  // Mock M365 stats - in production, this would call MS Graph API
  res.json({
    total_users: 0,
    active_users: 0,
    total_licenses: 0,
    assigned_licenses: 0,
    total_groups: 0,
    license_utilization: 0,
    note: 'Connect Microsoft Graph API for live M365 statistics'
  })
})

// Cloudflare MCP Server endpoints
app.get('/api/cloudflare/status', (req, res) => {
  const monitoringConfig = readJSON('coordination/monitoring/cloudflare-mcp-server.json')
  const healthLog = readJSONL('coordination/monitoring/alerts/cloudflare-mcp-server.log', 10)

  const latestHealthCheck = healthLog.length > 0 ? healthLog[healthLog.length - 1] : null

  res.json({
    service: 'cloudflare-mcp-server',
    status: latestHealthCheck?.severity === 'critical' ? 'unhealthy' : 'healthy',
    last_check: latestHealthCheck?.timestamp || new Date().toISOString(),
    integration_enabled: monitoringConfig?.monitoring?.enabled || false,
    api_connected: latestHealthCheck?.severity !== 'critical',
    version: monitoringConfig?.repository?.version || '1.0.0'
  })
})

app.get('/api/cloudflare/metrics', (req, res) => {
  // Read latest metrics file
  const metricsDir = path.join(CORTEX_ROOT, 'coordination/monitoring/metrics')
  let latestMetrics = null

  try {
    const files = fs.readdirSync(metricsDir)
      .filter(f => f.startsWith('cloudflare-') && f.endsWith('.json'))
      .sort()
      .reverse()

    if (files.length > 0) {
      latestMetrics = readJSON(`coordination/monitoring/metrics/${files[0]}`)
    }
  } catch (error) {
    console.error('Error reading Cloudflare metrics:', error.message)
  }

  res.json({
    dns: {
      zones_managed: latestMetrics?.zones_managed || 0,
      records_total: latestMetrics?.dns_records_total || 0,
      records_by_type: latestMetrics?.dns_records_by_type || {},
      last_update: latestMetrics?.timestamp || new Date().toISOString()
    },
    cdn: {
      bandwidth_bytes: latestMetrics?.bandwidth_bytes || 0,
      requests_total: latestMetrics?.requests_total || 0,
      cache_hit_ratio: latestMetrics?.cache_hit_ratio || 0,
      threats_blocked: latestMetrics?.threats_blocked || 0
    },
    api: {
      requests_total: latestMetrics?.api_requests_total || 0,
      requests_successful: latestMetrics?.api_requests_successful || 0,
      requests_failed: latestMetrics?.api_requests_failed || 0,
      avg_response_time_ms: latestMetrics?.api_avg_response_time_ms || 0
    },
    kv_storage: {
      namespaces_count: latestMetrics?.kv_namespaces_count || 0,
      keys_total: latestMetrics?.kv_keys_total || 0,
      operations_total: latestMetrics?.kv_operations_total || 0
    }
  })
})

app.get('/api/cloudflare/health-checks', (req, res) => {
  const healthLog = readJSONL('coordination/monitoring/alerts/cloudflare-mcp-server.log', 50)

  res.json({
    checks: healthLog.map(log => ({
      timestamp: log.timestamp,
      severity: log.severity,
      alert: log.alert,
      message: log.message,
      service: log.service
    })),
    summary: {
      total_checks: healthLog.length,
      critical_alerts: healthLog.filter(l => l.severity === 'critical').length,
      warnings: healthLog.filter(l => l.severity === 'warning').length,
      last_check: healthLog.length > 0 ? healthLog[healthLog.length - 1].timestamp : null
    }
  })
})

app.get('/api/cloudflare/zones', (req, res) => {
  // This would be populated by actual Cloudflare API data
  // For now, return mock structure
  res.json({
    zones: [
      {
        id: 'zone-001',
        name: 'example.com',
        status: 'active',
        records_count: 15,
        last_modified: new Date().toISOString()
      }
    ],
    total: 1
  })
})

app.get('/api/cloudflare/analytics', (req, res) => {
  const { timeRange = '24h' } = req.query

  // Mock analytics data - would be populated from actual Cloudflare Analytics API
  res.json({
    timeRange,
    data: {
      requests: Array.from({ length: 24 }, (_, i) => ({
        timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
        count: Math.floor(Math.random() * 10000) + 5000
      })),
      bandwidth: Array.from({ length: 24 }, (_, i) => ({
        timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
        bytes: Math.floor(Math.random() * 1000000000) + 500000000
      })),
      threats: Array.from({ length: 24 }, (_, i) => ({
        timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
        count: Math.floor(Math.random() * 50)
      }))
    }
  })
})

// OpenTofu/Terraform IaC Server endpoints
app.get('/api/opentofu/health', (req, res) => {
  // Read latest health check report
  const reportsDir = path.join(CORTEX_ROOT, 'coordination/reports/opentofu-mcp-server')
  let latestReport = null

  try {
    const files = fs.readdirSync(reportsDir)
      .filter(f => f.startsWith('health-check-') && f.endsWith('.json'))
      .sort()
      .reverse()

    if (files.length > 0) {
      const reportPath = path.join(reportsDir, files[0])
      latestReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
    }
  } catch (error) {
    console.error('Error reading OpenTofu health reports:', error.message)
  }

  res.json({
    status: latestReport?.health_score >= 80 ? 'healthy' :
            latestReport?.health_score >= 60 ? 'degraded' : 'unhealthy',
    health_score: latestReport?.health_score || 0,
    cli_status: latestReport?.cli_status || {},
    mcp_server: latestReport?.mcp_server || {},
    last_check: latestReport?.timestamp || null,
    operations: latestReport?.operations || {},
    security: latestReport?.security || {}
  })
})

app.get('/api/opentofu/metrics', (req, res) => {
  const monitoringConfig = readJSON('coordination/monitoring/opentofu-mcp-server.json')
  const events = readJSONL('coordination/dashboard-events.jsonl', 100)

  // Filter OpenTofu/IaC related events
  const iacEvents = events.filter(e =>
    e.source === 'opentofu-mcp-server' ||
    e.component === 'iac' ||
    e.event_type === 'health_check'
  )

  // Read latest health report for detailed metrics
  const reportsDir = path.join(CORTEX_ROOT, 'coordination/reports/opentofu-mcp-server')
  let latestReport = null
  let operationLog = null

  try {
    // Get latest health report
    const files = fs.readdirSync(reportsDir)
      .filter(f => f.startsWith('health-check-') && f.endsWith('.json'))
      .sort()
      .reverse()

    if (files.length > 0) {
      const reportPath = path.join(reportsDir, files[0])
      latestReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
    }

    // Read operation log if it exists
    const opLogPath = path.join(CORTEX_ROOT, '../opentofu-mcp-server/tofu_operations.log')
    if (fs.existsSync(opLogPath)) {
      const opLogContent = fs.readFileSync(opLogPath, 'utf8')
      operationLog = opLogContent
        .split('\n')
        .filter(line => line.trim())
        .slice(-50)
        .map(line => JSON.parse(line))
    }
  } catch (error) {
    console.error('Error reading OpenTofu data:', error.message)
  }

  // Calculate metrics
  const totalOps = latestReport?.operations?.total_operations || 0
  const applyOps = latestReport?.operations?.apply_operations || 0
  const destroyOps = latestReport?.operations?.destroy_operations || 0
  const failedOps = latestReport?.operations?.failed_operations || 0
  const failureRate = totalOps > 0 ? (failedOps / totalOps) * 100 : 0
  const successRate = 100 - failureRate

  // Protected workspaces
  const protectedWorkspaces = latestReport?.workspace_protection?.protected_workspaces?.split(',') ||
                              ['production', 'prod', 'main']

  // Recent operations from log
  const recentOps = operationLog ? operationLog.slice(-10) : []

  // Calculate operation types distribution
  const opsByType = {
    apply: applyOps,
    destroy: destroyOps,
    plan: 0,
    init: 0,
    other: totalOps - applyOps - destroyOps
  }

  res.json({
    health_score: latestReport?.health_score || 0,
    cli_version: latestReport?.cli_status?.opentofu_version ||
                 latestReport?.cli_status?.terraform_version || 'unknown',
    cli_type: latestReport?.cli_status?.primary_cli || 'unknown',
    operations: {
      total: totalOps,
      apply: applyOps,
      destroy: destroyOps,
      failed: failedOps,
      success_rate: Math.round(successRate),
      failure_rate: Math.round(failureRate),
      by_type: opsByType
    },
    workspace_protection: {
      enabled: true,
      protected_count: protectedWorkspaces.length,
      workspaces: protectedWorkspaces
    },
    security: {
      issues_count: latestReport?.security?.issues_count || 0,
      warnings: latestReport?.security?.warnings || [],
      last_scan: latestReport?.security?.last_scan || null
    },
    recent_operations: recentOps,
    recent_events: iacEvents.slice(-20),
    monitoring_enabled: monitoringConfig?.monitoring_config?.enabled || false,
    dashboard_widget: monitoringConfig?.monitoring_config?.observability?.dashboard_widget || {},
    infrastructure_metrics: {
      resources_managed: 0,
      workspaces: protectedWorkspaces.length,
      state_backend: 'local',
      last_operation: recentOps.length > 0 ? recentOps[recentOps.length - 1] : null
    }
  })
})

app.get('/api/opentofu/operations', (req, res) => {
  const limit = parseInt(req.query.limit) || 50

  try {
    const opLogPath = path.join(CORTEX_ROOT, '../opentofu-mcp-server/tofu_operations.log')
    if (fs.existsSync(opLogPath)) {
      const opLogContent = fs.readFileSync(opLogPath, 'utf8')
      const operations = opLogContent
        .split('\n')
        .filter(line => line.trim())
        .slice(-limit)
        .map(line => JSON.parse(line))

      res.json({
        total: operations.length,
        operations: operations.reverse()
      })
    } else {
      res.json({
        total: 0,
        operations: []
      })
    }
  } catch (error) {
    console.error('Error reading operation log:', error.message)
    res.status(500).json({ error: 'Failed to read operation log' })
  }
})

app.get('/api/opentofu/security', (req, res) => {
  const securityTask = readJSON('coordination/tasks/opentofu-security-scan.json')

  res.json({
    scan_status: securityTask?.status || 'pending',
    priority: securityTask?.priority || 'critical',
    focus_areas: securityTask?.scan_config?.focus_areas || [],
    compliance_checks: securityTask?.compliance_checks || {},
    security_notes: securityTask?.security_notes || {},
    risk_assessment: securityTask?.risk_assessment || {},
    scheduled_scans: securityTask?.scheduled_scans || {}
  })
})

// UniFi MCP Server endpoints
app.get('/api/unifi/health', (req, res) => {
  const healthSummary = readJSON('coordination/monitoring/unifi-health-summary.json')
  const monitoringConfig = readJSON('coordination/monitoring/unifi-mcp-server.json')

  res.json({
    status: healthSummary?.overall_status || 'unknown',
    failed_checks: healthSummary?.failed_checks || 0,
    warnings: healthSummary?.warnings || 0,
    last_check: healthSummary?.timestamp || null,
    monitoring_enabled: monitoringConfig?.monitoring_config?.enabled || false,
    checks_completed: healthSummary?.checks_completed || {}
  })
})

app.get('/api/unifi/infrastructure', (req, res) => {
  // Mock UniFi infrastructure stats - in production, this would call UniFi MCP server tools
  // Data would come from: get_system_status, get_device_health, get_client_activity
  res.json({
    controller_status: 'healthy',
    controller_uptime: '99.9%',
    total_devices: 0,
    online_devices: 0,
    offline_devices: 0,
    device_types: {
      routers: 0,
      switches: 0,
      access_points: 0,
      gateways: 0
    },
    total_clients: 0,
    active_clients: 0,
    wireless_clients: 0,
    wired_clients: 0,
    bandwidth_usage: {
      download_mbps: 0,
      upload_mbps: 0
    },
    protect_cameras: {
      total: 0,
      online: 0,
      recording: 0
    },
    access_doors: {
      total: 0,
      online: 0
    },
    note: 'Configure UniFi MCP server with controller credentials for live statistics'
  })
})

app.get('/api/unifi/metrics', (req, res) => {
  const monitoringConfig = readJSON('coordination/monitoring/unifi-mcp-server.json')
  const events = readJSONL('coordination/dashboard-events.jsonl', 100)

  // Filter UniFi related events
  const unifiEvents = events.filter(e =>
    e.component === 'unifi-mcp-server' ||
    e.source === 'health_check' ||
    e.event?.includes('unifi')
  )

  // Calculate metrics
  const healthChecksPassed = unifiEvents.filter(e => e.event_type === 'health_check_passed').length
  const healthChecksFailed = unifiEvents.filter(e => e.event_type === 'health_check_failed').length
  const totalHealthChecks = healthChecksPassed + healthChecksFailed
  const healthCheckSuccessRate = totalHealthChecks > 0 ? (healthChecksPassed / totalHealthChecks) * 100 : 0

  const controllerReachable = unifiEvents.filter(e => e.event === 'controller_reachable').length
  const controllerUnreachable = unifiEvents.filter(e => e.event === 'controller_unreachable').length
  const totalConnectivityChecks = controllerReachable + controllerUnreachable
  const controllerAvailability = totalConnectivityChecks > 0 ? (controllerReachable / totalConnectivityChecks) * 100 : 0

  res.json({
    health_check_success_rate: Math.round(healthCheckSuccessRate),
    controller_availability: Math.round(controllerAvailability),
    total_health_checks: totalHealthChecks,
    total_connectivity_checks: totalConnectivityChecks,
    recent_events: unifiEvents.slice(-20),
    monitoring_enabled: monitoringConfig?.monitoring_config?.enabled || false,
    dashboard_widget: monitoringConfig?.monitoring_config?.observability?.dashboard_widget || {},
    a2a_protocol: monitoringConfig?.a2a_protocol || {}
  })
})

app.get('/api/unifi/security', (req, res) => {
  const securityTask = readJSON('coordination/tasks/unifi-mcp-security-scan.json')

  res.json({
    scan_status: securityTask?.status || 'pending',
    priority: securityTask?.priority || 'high',
    focus_areas: securityTask?.scan_config?.focus_areas || [],
    unifi_specific_checks: securityTask?.unifi_specific_checks || {},
    security_notes: securityTask?.security_notes || {},
    compliance_requirements: securityTask?.compliance_requirements || {},
    last_scan: securityTask?.last_scan_date || null
  })
})

app.get('/api/unifi/network-stats', (req, res) => {
  // Aggregated network statistics from UniFi infrastructure
  // In production, this would aggregate data from multiple UniFi MCP server resources
  res.json({
    network_health: {
      overall_score: 0,
      device_uptime_avg: 0,
      client_satisfaction_score: 0,
      bandwidth_utilization: 0
    },
    device_summary: {
      total: 0,
      healthy: 0,
      warning: 0,
      critical: 0,
      offline: 0
    },
    client_summary: {
      total_active: 0,
      peak_concurrent: 0,
      avg_bandwidth_per_client: 0,
      blocked_clients: 0
    },
    wlan_summary: {
      total_ssids: 0,
      enabled_ssids: 0,
      disabled_ssids: 0,
      guest_networks: 0
    },
    api_health: {
      integration_api: 'unknown',
      legacy_api: 'unknown',
      site_manager_api: 'unknown',
      protect_api: 'unknown',
      access_api: 'unknown'
    },
    note: 'Configure UniFi controller credentials in secrets.env for live network statistics'
  })
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Cortex EUI API Server running on http://localhost:${PORT}`)
  console.log(`📊 Serving data from: ${CORTEX_ROOT}/coordination/`)
})
