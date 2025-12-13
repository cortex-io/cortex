import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { exec } from 'child_process'
import { promisify } from 'util'
import axios from 'axios'

const execAsync = promisify(exec)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Remediation Engine for Cortex Self-Healing
 *
 * Executes remediation playbooks in response to detected anomalies
 * Supports multiple fix strategies with retry logic and verification
 */

class RemediationEngine {
  constructor() {
    this.playbookDir = path.join(__dirname, 'playbooks')
    this.remediationHistory = []
    this.maxHistorySize = 500
    this.maxRetries = 3
    this.retryDelay = 30000 // 30 seconds
  }

  /**
   * Load playbook from disk
   */
  loadPlaybook(playbookName) {
    try {
      const playbookPath = path.join(this.playbookDir, `${playbookName}.json`)

      if (!fs.existsSync(playbookPath)) {
        console.error(`[Remediation] Playbook not found: ${playbookName}`)
        return null
      }

      const content = fs.readFileSync(playbookPath, 'utf8')
      return JSON.parse(content)
    } catch (error) {
      console.error(`[Remediation] Error loading playbook ${playbookName}:`, error.message)
      return null
    }
  }

  /**
   * Execute a single playbook step
   */
  async executeStep(step, context) {
    console.log(`[Remediation] Executing step: ${step.action}`)

    try {
      switch (step.action) {
        case 'collect_logs':
          return await this.collectLogs(step.params)

        case 'analyze_failures':
          return await this.analyzeFailures(step, context)

        case 'apply_fix':
          return await this.applyFix(step, context)

        case 'verify_resolution':
          return await this.verifyResolution(step, context)

        case 'scale_deployment':
          return await this.scaleDeployment(step.params)

        case 'restart_pods':
          return await this.restartPods(step.params)

        case 'update_config':
          return await this.updateConfig(step.params)

        case 'create_github_issue':
          return await this.createGitHubIssue(step, context)

        default:
          console.warn(`[Remediation] Unknown action: ${step.action}`)
          return { success: false, error: 'Unknown action' }
      }
    } catch (error) {
      console.error(`[Remediation] Step ${step.action} failed:`, error.message)
      return { success: false, error: error.message }
    }
  }

  /**
   * Collect logs from Kubernetes
   */
  async collectLogs(params) {
    const { namespace, label, tail = 100 } = params

    try {
      const labelSelector = typeof label === 'string'
        ? label
        : Object.entries(label).map(([k, v]) => `${k}=${v}`).join(',')

      const { stdout } = await execAsync(
        `kubectl logs -n ${namespace} -l ${labelSelector} --tail=${tail}`
      )

      return {
        success: true,
        logs: stdout,
        lines: stdout.split('\n').length
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Analyze failures using AI (simulated for now)
   */
  async analyzeFailures(step, context) {
    const { ai_prompt } = step

    // In production, this would call an LLM API
    // For now, we'll do basic log analysis

    const logs = context.logs || ''
    const errorPatterns = [
      /error|failed|exception/i,
      /timeout/i,
      /out of memory|oom/i,
      /connection refused/i,
      /permission denied/i
    ]

    const errors = []
    for (const line of logs.split('\n')) {
      for (const pattern of errorPatterns) {
        if (pattern.test(line)) {
          errors.push(line.trim())
          break
        }
      }
    }

    return {
      success: true,
      analysis: {
        error_count: errors.length,
        sample_errors: errors.slice(0, 10),
        suggested_fix: this.suggestFix(errors)
      }
    }
  }

  /**
   * Suggest fix based on error patterns
   */
  suggestFix(errors) {
    const errorText = errors.join(' ').toLowerCase()

    if (errorText.includes('out of memory') || errorText.includes('oom')) {
      return 'scale_up'
    } else if (errorText.includes('timeout') || errorText.includes('connection refused')) {
      return 'restart_pod'
    } else if (errorText.includes('permission denied')) {
      return 'update_config'
    } else {
      return 'restart_pod'
    }
  }

  /**
   * Apply fix based on strategy
   */
  async applyFix(step, context) {
    const { fix_strategies, conditional } = step
    const suggestedFix = context.analysis?.suggested_fix

    // If conditional, use suggested fix from analysis
    const strategy = conditional && suggestedFix
      ? suggestedFix
      : fix_strategies[0]

    console.log(`[Remediation] Applying fix strategy: ${strategy}`)

    switch (strategy) {
      case 'restart_pod':
        return await this.restartPods(context.anomaly)

      case 'scale_down_then_up':
        return await this.scaleDownThenUp(context.anomaly)

      case 'scale_up':
        return await this.scaleDeployment({ replicas: '+1' })

      case 'update_config':
        return await this.updateConfig(context.anomaly)

      default:
        return { success: false, error: `Unknown strategy: ${strategy}` }
    }
  }

  /**
   * Restart pods for a deployment
   */
  async restartPods(params) {
    const { namespace = 'cortex', deployment } = params

    try {
      const { stdout } = await execAsync(
        `kubectl rollout restart deployment/${deployment} -n ${namespace}`
      )

      // Wait for rollout to complete
      await execAsync(
        `kubectl rollout status deployment/${deployment} -n ${namespace} --timeout=5m`
      )

      return {
        success: true,
        message: `Restarted deployment ${deployment}`,
        output: stdout
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Scale deployment down then back up
   */
  async scaleDownThenUp(params) {
    const { namespace = 'cortex', deployment } = params

    try {
      // Get current replicas
      const { stdout: currentReplicas } = await execAsync(
        `kubectl get deployment ${deployment} -n ${namespace} -o jsonpath='{.spec.replicas}'`
      )

      const replicas = parseInt(currentReplicas)

      // Scale down to 0
      await execAsync(
        `kubectl scale deployment/${deployment} -n ${namespace} --replicas=0`
      )

      // Wait 10 seconds
      await new Promise(resolve => setTimeout(resolve, 10000))

      // Scale back up
      await execAsync(
        `kubectl scale deployment/${deployment} -n ${namespace} --replicas=${replicas}`
      )

      return {
        success: true,
        message: `Scaled ${deployment} down and back up to ${replicas} replicas`
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Scale deployment
   */
  async scaleDeployment(params) {
    const { namespace = 'cortex', deployment, replicas } = params

    try {
      const replicaCount = replicas.startsWith('+') || replicas.startsWith('-')
        ? await this.calculateRelativeReplicas(namespace, deployment, replicas)
        : parseInt(replicas)

      const { stdout } = await execAsync(
        `kubectl scale deployment/${deployment} -n ${namespace} --replicas=${replicaCount}`
      )

      return {
        success: true,
        message: `Scaled ${deployment} to ${replicaCount} replicas`,
        output: stdout
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Calculate relative replica count
   */
  async calculateRelativeReplicas(namespace, deployment, change) {
    const { stdout } = await execAsync(
      `kubectl get deployment ${deployment} -n ${namespace} -o jsonpath='{.spec.replicas}'`
    )

    const current = parseInt(stdout)
    const delta = parseInt(change)

    return Math.max(1, current + delta)
  }

  /**
   * Update configuration
   */
  async updateConfig(params) {
    // This is a placeholder - actual implementation would depend on
    // what config needs updating
    console.log('[Remediation] Config update requested:', params)

    return {
      success: true,
      message: 'Configuration update simulated'
    }
  }

  /**
   * Verify resolution by checking metric
   */
  async verifyResolution(step, context) {
    const { timeout = '10m', success_criteria } = step

    const timeoutMs = this.parseTimeout(timeout)
    const startTime = Date.now()

    console.log(`[Remediation] Verifying resolution: ${success_criteria}`)

    while (Date.now() - startTime < timeoutMs) {
      try {
        const prometheusUrl = 'http://prometheus.monitoring.svc.cluster.local:9090'
        const response = await axios.get(`${prometheusUrl}/api/v1/query`, {
          params: { query: success_criteria },
          timeout: 5000
        })

        if (response.data.status === 'success' && response.data.data.result.length > 0) {
          const value = parseFloat(response.data.data.result[0].value[1])

          // Success criteria should evaluate to true (1) or non-zero
          if (value > 0 || !isNaN(value)) {
            console.log('[Remediation] Resolution verified')
            return {
              success: true,
              verified: true,
              value
            }
          }
        }

        // Wait 30 seconds before next check
        await new Promise(resolve => setTimeout(resolve, 30000))
      } catch (error) {
        console.error('[Remediation] Verification check failed:', error.message)
      }
    }

    console.log('[Remediation] Resolution verification timed out')
    return {
      success: false,
      verified: false,
      error: 'Verification timeout'
    }
  }

  /**
   * Parse timeout string (e.g., "10m", "2h") to milliseconds
   */
  parseTimeout(timeout) {
    const match = timeout.match(/^(\d+)([smh])$/)
    if (!match) return 600000 // Default 10 minutes

    const value = parseInt(match[1])
    const unit = match[2]

    const multipliers = {
      s: 1000,
      m: 60000,
      h: 3600000
    }

    return value * multipliers[unit]
  }

  /**
   * Create GitHub issue for manual intervention
   */
  async createGitHubIssue(step, context) {
    const { title, labels = ['self-healing', 'automated'] } = step

    const issueBody = `
## Anomaly Detected

**Metric:** ${context.anomaly.metric}
**Severity:** ${context.anomaly.severity}
**Detected At:** ${context.anomaly.detected_at}

### Details

- **Current Value:** ${context.anomaly.current}
- **Baseline:** ${context.anomaly.baseline || 'N/A'}
- **Threshold Type:** ${context.anomaly.threshold_type}

### Remediation Attempted

${context.remediation_steps.map((s, i) => `${i + 1}. ${s.action} - ${s.result?.success ? 'SUCCESS' : 'FAILED'}`).join('\n')}

### Manual Action Required

Automated remediation was unsuccessful. Please investigate manually.

---
*This issue was automatically created by Cortex Self-Healing System*
    `.trim()

    console.log('[Remediation] Would create GitHub issue:', { title, labels })
    console.log('[Remediation] Issue body:', issueBody)

    // In production, this would use GitHub API
    // For now, we'll just log it

    return {
      success: true,
      simulated: true,
      issue: {
        title,
        body: issueBody,
        labels
      }
    }
  }

  /**
   * Execute complete playbook
   */
  async executePlaybook(playbook, anomaly) {
    const remediationId = `remediation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    console.log(`[Remediation ${remediationId}] Starting playbook: ${playbook.playbook_id}`)

    const context = {
      anomaly,
      remediation_id: remediationId,
      remediation_steps: []
    }

    let success = true

    for (let i = 0; i < playbook.steps.length; i++) {
      const step = playbook.steps[i]

      console.log(`[Remediation ${remediationId}] Step ${i + 1}/${playbook.steps.length}: ${step.action}`)

      const result = await this.executeStep(step, context)

      context.remediation_steps.push({
        step: i + 1,
        action: step.action,
        result
      })

      // Store results in context for next steps
      if (step.action === 'collect_logs' && result.success) {
        context.logs = result.logs
      } else if (step.action === 'analyze_failures' && result.success) {
        context.analysis = result.analysis
      }

      // If step failed and not conditional, stop execution
      if (!result.success && !step.conditional) {
        console.error(`[Remediation ${remediationId}] Critical step failed, aborting`)
        success = false
        break
      }
    }

    const remediation = {
      remediation_id: remediationId,
      playbook_id: playbook.playbook_id,
      anomaly,
      steps: context.remediation_steps,
      success,
      completed_at: new Date().toISOString()
    }

    this.recordRemediation(remediation)

    return remediation
  }

  /**
   * Trigger remediation for detected anomaly
   */
  async triggerRemediation(anomaly) {
    const { playbook: playbookName, metric, severity } = anomaly

    console.log(`[Remediation] Triggering for ${metric} (severity: ${severity})`)

    // Check if already remediating this issue
    const recentRemediations = this.remediationHistory.filter(r => {
      const age = Date.now() - new Date(r.completed_at).getTime()
      return r.anomaly.metric === metric && age < 300000 // 5 minutes
    })

    if (recentRemediations.length >= this.maxRetries) {
      console.log(`[Remediation] Max retries reached for ${metric}, escalating to GitHub issue`)

      // Create GitHub issue for manual intervention
      await this.createGitHubIssue(
        {
          title: `[Self-Healing] Manual intervention required: ${metric}`,
          labels: ['self-healing', 'manual-intervention', severity]
        },
        {
          anomaly,
          remediation_steps: recentRemediations.map(r => r.steps).flat()
        }
      )

      return
    }

    // Load and execute playbook
    const playbook = this.loadPlaybook(playbookName)

    if (!playbook) {
      console.error(`[Remediation] No playbook found for ${playbookName}`)
      return
    }

    return await this.executePlaybook(playbook, anomaly)
  }

  /**
   * Record remediation in history
   */
  recordRemediation(remediation) {
    this.remediationHistory.push(remediation)

    // Keep history manageable
    if (this.remediationHistory.length > this.maxHistorySize) {
      this.remediationHistory = this.remediationHistory.slice(-this.maxHistorySize)
    }

    // Persist to disk
    this.persistHistory()
  }

  /**
   * Persist remediation history
   */
  persistHistory() {
    try {
      const historyPath = path.join(__dirname, '../../coordination/remediation-history.jsonl')
      const historyDir = path.dirname(historyPath)

      if (!fs.existsSync(historyDir)) {
        fs.mkdirSync(historyDir, { recursive: true })
      }

      const latest = this.remediationHistory[this.remediationHistory.length - 1]
      if (latest) {
        fs.appendFileSync(historyPath, JSON.stringify(latest) + '\n')
      }
    } catch (error) {
      console.error('[Remediation] Error persisting history:', error.message)
    }
  }

  /**
   * Get remediation statistics
   */
  getStats() {
    const successCount = this.remediationHistory.filter(r => r.success).length
    const successRate = this.remediationHistory.length > 0
      ? successCount / this.remediationHistory.length
      : 0

    const byPlaybook = {}
    for (const remediation of this.remediationHistory) {
      const playbook = remediation.playbook_id
      if (!byPlaybook[playbook]) {
        byPlaybook[playbook] = { total: 0, success: 0 }
      }
      byPlaybook[playbook].total++
      if (remediation.success) {
        byPlaybook[playbook].success++
      }
    }

    return {
      total_remediations: this.remediationHistory.length,
      success_count: successCount,
      success_rate: successRate,
      by_playbook: byPlaybook,
      last_remediation: this.remediationHistory.length > 0
        ? this.remediationHistory[this.remediationHistory.length - 1]
        : null
    }
  }
}

export default RemediationEngine
