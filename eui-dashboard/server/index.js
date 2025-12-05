import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CORTEX_ROOT = path.join(__dirname, '..', '..')

const app = express()
const PORT = 3004

app.use(cors())
app.use(express.json())

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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Cortex EUI API Server running on http://localhost:${PORT}`)
  console.log(`📊 Serving data from: ${CORTEX_ROOT}/coordination/`)
})
