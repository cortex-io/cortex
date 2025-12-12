import { register, Gauge, Counter, Histogram } from 'prom-client'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CORTEX_ROOT = path.join(__dirname, '..', '..')

// Helper to safely read JSON files
const readJSON = (filePath) => {
  try {
    const fullPath = path.join(CORTEX_ROOT, filePath)
    if (!fs.existsSync(fullPath)) return null
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
    if (!fs.existsSync(fullPath)) return []
    const content = fs.readFileSync(fullPath, 'utf8')
    return content
      .split('\n')
      .filter(line => line.trim())
      .slice(-limit)
      .map(line => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      })
      .filter(obj => obj !== null)
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message)
    return []
  }
}

// Helper to get all master state files
const getAllMasterStates = () => {
  const masterNames = ['coordinator', 'development', 'security', 'cicd', 'inventory']
  const states = {}

  for (const master of masterNames) {
    const statePath = `coordination/masters/${master}/context/master-state.json`
    const state = readJSON(statePath)
    if (state) {
      states[master] = state
    }
  }

  return states
}

// ============================================================================
// TASK QUEUE METRICS
// ============================================================================

const taskQueueDepth = new Gauge({
  name: 'cortex_task_queue_depth',
  help: 'Current task queue depth by type',
  labelNames: ['type']
})

const taskQueueAge = new Gauge({
  name: 'cortex_task_queue_age_seconds',
  help: 'Age of oldest task in queue by type',
  labelNames: ['type']
})

// ============================================================================
// WORKER METRICS
// ============================================================================

const activeWorkers = new Gauge({
  name: 'cortex_active_workers',
  help: 'Currently active workers by type and status',
  labelNames: ['type', 'status']
})

const workerSpawnRate = new Counter({
  name: 'cortex_worker_spawn_total',
  help: 'Total worker spawns',
  labelNames: ['type']
})

const workerTerminationTotal = new Counter({
  name: 'cortex_worker_termination_total',
  help: 'Total worker terminations',
  labelNames: ['type', 'reason']
})

// ============================================================================
// MASTER METRICS
// ============================================================================

const masterHealth = new Gauge({
  name: 'cortex_master_health',
  help: 'Master health status (1=healthy, 0=unhealthy)',
  labelNames: ['master']
})

const moeRoutingConfidence = new Gauge({
  name: 'cortex_moe_routing_confidence',
  help: 'MoE routing confidence score',
  labelNames: ['from_master', 'to_master']
})

const moeHandoffTotal = new Counter({
  name: 'cortex_moe_handoff_total',
  help: 'Total MoE handoffs',
  labelNames: ['from_master', 'to_master']
})

// ============================================================================
// TASK EXECUTION METRICS
// ============================================================================

const taskDuration = new Histogram({
  name: 'cortex_task_duration_seconds',
  help: 'Task completion time in seconds',
  labelNames: ['type', 'status'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600, 1800, 3600]
})

const taskSuccessRate = new Gauge({
  name: 'cortex_task_success_rate',
  help: 'Task success rate (0-1)',
  labelNames: ['type']
})

const taskCompletionTotal = new Counter({
  name: 'cortex_task_completion_total',
  help: 'Total task completions',
  labelNames: ['type', 'status']
})

// ============================================================================
// TOKEN BUDGET METRICS
// ============================================================================

const tokenBudgetTotal = new Gauge({
  name: 'cortex_token_budget_total',
  help: 'Total token budget',
  labelNames: []
})

const tokenBudgetAllocated = new Gauge({
  name: 'cortex_token_budget_allocated',
  help: 'Currently allocated tokens',
  labelNames: []
})

const tokenBudgetAvailable = new Gauge({
  name: 'cortex_token_budget_available',
  help: 'Available tokens',
  labelNames: []
})

// ============================================================================
// METRICS UPDATE FUNCTION
// ============================================================================

let lastWorkerCount = {}
let lastTaskCount = {}
let lastHandoffCount = {}

export function updateMetrics() {
  try {
    // Update task queue metrics
    const taskQueue = readJSON('coordination/task-queue.json')
    if (taskQueue && taskQueue.tasks) {
      const tasksByType = {}
      const now = new Date()

      for (const task of taskQueue.tasks) {
        if (task.status === 'completed') continue

        const type = task.type || 'unknown'
        if (!tasksByType[type]) {
          tasksByType[type] = { count: 0, oldestAge: 0 }
        }

        tasksByType[type].count++

        if (task.created_at) {
          const createdAt = new Date(task.created_at)
          const ageSeconds = (now - createdAt) / 1000
          tasksByType[type].oldestAge = Math.max(tasksByType[type].oldestAge, ageSeconds)
        }
      }

      // Reset all to 0 first, then set actual values
      const types = ['implementation', 'security', 'analysis', 'scan', 'feature', 'bug_fix']
      for (const type of types) {
        taskQueueDepth.set({ type }, 0)
        taskQueueAge.set({ type }, 0)
      }

      for (const [type, data] of Object.entries(tasksByType)) {
        taskQueueDepth.set({ type }, data.count)
        taskQueueAge.set({ type }, data.oldestAge)
      }
    }

    // Update worker metrics
    const workerPool = readJSON('coordination/worker-pool.json')
    if (workerPool) {
      const workersByType = {}

      if (workerPool.active_workers) {
        for (const worker of workerPool.active_workers) {
          const type = worker.worker_type || 'unknown'
          const status = worker.status || 'unknown'

          const key = `${type}:${status}`
          workersByType[key] = (workersByType[key] || 0) + 1

          // Track spawn rate (incremental counter)
          const lastCount = lastWorkerCount[type] || 0
          const currentCount = workersByType[key] || 0
          if (currentCount > lastCount) {
            workerSpawnRate.inc({ type }, currentCount - lastCount)
          }
        }

        lastWorkerCount = { ...workersByType }
      }

      // Reset all to 0 first
      const workerTypes = ['implementation-worker', 'security-worker', 'analysis-worker', 'scan-worker', 'feature-implementer', 'bug-fixer']
      const statuses = ['running', 'idle', 'spawning', 'terminating']
      for (const type of workerTypes) {
        for (const status of statuses) {
          activeWorkers.set({ type, status }, 0)
        }
      }

      // Set actual values
      for (const [key, count] of Object.entries(workersByType)) {
        const [type, status] = key.split(':')
        activeWorkers.set({ type, status }, count)
      }
    }

    // Update master health metrics
    const masterStates = getAllMasterStates()
    const now = new Date()

    for (const [masterName, state] of Object.entries(masterStates)) {
      let isHealthy = 1

      // Check last heartbeat (if exists)
      if (state.last_run) {
        const lastRun = new Date(state.last_run)
        const ageSeconds = (now - lastRun) / 1000

        // Unhealthy if no activity in 5 minutes
        if (ageSeconds > 300) {
          isHealthy = 0
        }
      }

      // Check status
      if (state.status === 'error' || state.status === 'failed') {
        isHealthy = 0
      }

      masterHealth.set({ master: masterName }, isHealthy)
    }

    // Update MoE routing confidence
    const routingDecisions = readJSONL('coordination/masters/coordinator/knowledge-base/routing-decisions.jsonl', 50)
    if (routingDecisions.length > 0) {
      const confidenceByPair = {}

      for (const decision of routingDecisions) {
        if (decision.from_master && decision.to_master && decision.confidence !== undefined) {
          const key = `${decision.from_master}:${decision.to_master}`
          if (!confidenceByPair[key]) {
            confidenceByPair[key] = []
          }
          confidenceByPair[key].push(decision.confidence)
        }
      }

      for (const [key, confidences] of Object.entries(confidenceByPair)) {
        const [from, to] = key.split(':')
        const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length
        moeRoutingConfidence.set({ from_master: from, to_master: to }, avgConfidence)
      }
    }

    // Update handoff metrics
    const handoffFiles = fs.readdirSync(path.join(CORTEX_ROOT, 'coordination/masters/coordinator/handoffs'))
      .filter(f => f.endsWith('.json'))

    for (const file of handoffFiles) {
      const handoff = readJSON(`coordination/masters/coordinator/handoffs/${file}`)
      if (handoff && handoff.from_master && handoff.to_master) {
        const key = `${handoff.from_master}:${handoff.to_master}`
        const lastCount = lastHandoffCount[key] || 0
        const currentCount = (lastHandoffCount[key] || 0) + 1

        if (currentCount > lastCount) {
          moeHandoffTotal.inc({
            from_master: handoff.from_master,
            to_master: handoff.to_master
          }, 1)
        }

        lastHandoffCount[key] = currentCount
      }
    }

    // Update task execution metrics
    if (taskQueue && taskQueue.tasks) {
      const completedTasks = taskQueue.tasks.filter(t => t.status === 'completed' || t.status === 'failed')

      for (const task of completedTasks) {
        const type = task.type || 'unknown'
        const status = task.status

        // Calculate duration if timestamps exist
        if (task.created_at && task.completed_at) {
          const created = new Date(task.created_at)
          const completed = new Date(task.completed_at)
          const durationSeconds = (completed - created) / 1000

          taskDuration.observe({ type, status }, durationSeconds)
        }

        // Track completion count
        const taskKey = `${type}:${status}`
        const lastCount = lastTaskCount[taskKey] || 0
        const currentCount = (lastTaskCount[taskKey] || 0) + 1

        if (currentCount > lastCount) {
          taskCompletionTotal.inc({ type, status }, 1)
        }

        lastTaskCount[taskKey] = currentCount
      }

      // Calculate success rate by type
      const successByType = {}
      const totalByType = {}

      for (const task of completedTasks) {
        const type = task.type || 'unknown'
        totalByType[type] = (totalByType[type] || 0) + 1
        if (task.status === 'completed') {
          successByType[type] = (successByType[type] || 0) + 1
        }
      }

      for (const [type, total] of Object.entries(totalByType)) {
        const success = successByType[type] || 0
        const rate = total > 0 ? success / total : 0
        taskSuccessRate.set({ type }, rate)
      }
    }

    // Update token budget metrics
    const tokenBudget = readJSON('coordination/token-budget.json')
    if (tokenBudget) {
      tokenBudgetTotal.set(tokenBudget.total || 0)
      tokenBudgetAllocated.set(tokenBudget.allocated || 0)
      tokenBudgetAvailable.set(tokenBudget.available || 0)
    }

  } catch (error) {
    console.error('Error updating metrics:', error)
  }
}

// Update metrics every 15 seconds
setInterval(updateMetrics, 15000)

// Initial update
updateMetrics()

// Export the metrics endpoint handler
export function metricsHandler(req, res) {
  res.set('Content-Type', register.contentType)
  register.metrics().then(metrics => {
    res.send(metrics)
  }).catch(error => {
    console.error('Error generating metrics:', error)
    res.status(500).send('Error generating metrics')
  })
}

export default { updateMetrics, metricsHandler }
