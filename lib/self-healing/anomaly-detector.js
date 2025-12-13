import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Anomaly Detector for Cortex Self-Healing
 *
 * Monitors Prometheus metrics for anomalies and triggers remediation
 * Uses 7-day rolling average baselines with 2x threshold detection
 */

class AnomalyDetector {
  constructor(prometheusUrl = 'http://prometheus.monitoring.svc.cluster.local:9090') {
    this.prometheusUrl = prometheusUrl
    this.baselineWindow = '7d'
    this.anomalyThreshold = 2.0 // 2x baseline
    this.checkInterval = 60000 // 60 seconds
    this.detectionHistory = []
    this.maxHistorySize = 1000

    // Metrics to monitor for anomalies
    this.monitoredMetrics = [
      {
        name: 'cortex_worker_failure_rate',
        query: 'sum(rate(cortex_worker_termination_total{reason="spawn_failure"}[5m]))',
        baseline_query: 'avg_over_time(sum(rate(cortex_worker_termination_total{reason="spawn_failure"}[5m]))[7d:1h])',
        threshold: 0.2, // Absolute threshold
        severity: 'critical',
        playbook: 'high-worker-failure-rate'
      },
      {
        name: 'cortex_master_response_time',
        query: 'histogram_quantile(0.95, rate(cortex_task_duration_seconds_bucket[5m]))',
        baseline_query: 'avg_over_time(histogram_quantile(0.95, rate(cortex_task_duration_seconds_bucket[5m]))[7d:1h])',
        threshold_multiplier: 2.0,
        severity: 'warning',
        playbook: 'master-response-time-degradation'
      },
      {
        name: 'cortex_task_queue_depth',
        query: 'cortex:task_queue_depth:total',
        baseline_query: 'avg_over_time(cortex:task_queue_depth:total[7d])',
        threshold_multiplier: 3.0,
        threshold: 100, // Absolute threshold
        severity: 'warning',
        playbook: 'high-task-queue-depth'
      },
      {
        name: 'cortex_token_usage_rate',
        query: 'rate(cortex_token_budget_allocated[5m])',
        baseline_query: 'avg_over_time(rate(cortex_token_budget_allocated[5m])[7d:1h])',
        threshold_multiplier: 2.0,
        severity: 'critical',
        playbook: 'token-budget-exhaustion'
      },
      {
        name: 'cortex_master_health',
        query: 'sum(cortex_master_health)',
        threshold: 3, // Absolute minimum
        severity: 'critical',
        playbook: 'master-health-degradation'
      }
    ]
  }

  /**
   * Query Prometheus for metric value
   */
  async queryPrometheus(query) {
    try {
      const response = await axios.get(`${this.prometheusUrl}/api/v1/query`, {
        params: { query },
        timeout: 5000
      })

      if (response.data.status === 'success' && response.data.data.result.length > 0) {
        const value = parseFloat(response.data.data.result[0].value[1])
        return isNaN(value) ? null : value
      }

      return null
    } catch (error) {
      console.error(`Prometheus query error for "${query}":`, error.message)
      return null
    }
  }

  /**
   * Get baseline value for metric (7-day average)
   */
  async getBaseline(metric) {
    if (!metric.baseline_query) {
      return null
    }

    return await this.queryPrometheus(metric.baseline_query)
  }

  /**
   * Get current value for metric
   */
  async getCurrentValue(metric) {
    return await this.queryPrometheus(metric.query)
  }

  /**
   * Detect if current value is anomalous
   */
  async detectAnomaly(metric) {
    const current = await this.getCurrentValue(metric)

    if (current === null) {
      return null
    }

    // Check absolute threshold first
    if (metric.threshold !== undefined && current > metric.threshold) {
      return {
        metric: metric.name,
        current,
        baseline: metric.threshold,
        threshold_type: 'absolute',
        severity: metric.severity,
        playbook: metric.playbook,
        detected_at: new Date().toISOString()
      }
    }

    // Check relative threshold (2x baseline)
    if (metric.threshold_multiplier !== undefined) {
      const baseline = await this.getBaseline(metric)

      if (baseline === null || baseline === 0) {
        return null
      }

      const multiplier = metric.threshold_multiplier || this.anomalyThreshold

      if (current > baseline * multiplier) {
        return {
          metric: metric.name,
          current,
          baseline,
          multiplier,
          threshold_type: 'relative',
          severity: metric.severity,
          playbook: metric.playbook,
          detected_at: new Date().toISOString()
        }
      }
    }

    return null
  }

  /**
   * Check all monitored metrics for anomalies
   */
  async detectAnomalies() {
    const anomalies = []

    for (const metric of this.monitoredMetrics) {
      try {
        const anomaly = await this.detectAnomaly(metric)

        if (anomaly) {
          console.log(`[ANOMALY DETECTED] ${anomaly.metric}:`, {
            current: anomaly.current,
            baseline: anomaly.baseline,
            threshold_type: anomaly.threshold_type,
            severity: anomaly.severity
          })

          anomalies.push(anomaly)
          this.recordDetection(anomaly)
        }
      } catch (error) {
        console.error(`Error detecting anomaly for ${metric.name}:`, error.message)
      }
    }

    return anomalies
  }

  /**
   * Record anomaly detection in history
   */
  recordDetection(anomaly) {
    this.detectionHistory.push({
      ...anomaly,
      id: `anomaly-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    })

    // Keep history size manageable
    if (this.detectionHistory.length > this.maxHistorySize) {
      this.detectionHistory = this.detectionHistory.slice(-this.maxHistorySize)
    }

    // Persist to disk
    this.persistHistory()
  }

  /**
   * Persist detection history to disk
   */
  persistHistory() {
    try {
      const historyPath = path.join(__dirname, '../../coordination/self-healing-history.jsonl')
      const historyDir = path.dirname(historyPath)

      if (!fs.existsSync(historyDir)) {
        fs.mkdirSync(historyDir, { recursive: true })
      }

      // Append latest detection
      const latest = this.detectionHistory[this.detectionHistory.length - 1]
      if (latest) {
        fs.appendFileSync(historyPath, JSON.stringify(latest) + '\n')
      }
    } catch (error) {
      console.error('Error persisting anomaly history:', error.message)
    }
  }

  /**
   * Get anomaly statistics
   */
  getStats() {
    const now = Date.now()
    const oneHour = 60 * 60 * 1000
    const oneDay = 24 * oneHour

    const recentAnomalies = this.detectionHistory.filter(a => {
      const detectedAt = new Date(a.detected_at).getTime()
      return now - detectedAt < oneHour
    })

    const dailyAnomalies = this.detectionHistory.filter(a => {
      const detectedAt = new Date(a.detected_at).getTime()
      return now - detectedAt < oneDay
    })

    const byMetric = {}
    for (const anomaly of this.detectionHistory) {
      byMetric[anomaly.metric] = (byMetric[anomaly.metric] || 0) + 1
    }

    return {
      total_detections: this.detectionHistory.length,
      recent_1h: recentAnomalies.length,
      recent_24h: dailyAnomalies.length,
      by_metric: byMetric,
      last_detection: this.detectionHistory.length > 0
        ? this.detectionHistory[this.detectionHistory.length - 1]
        : null
    }
  }

  /**
   * Start continuous anomaly detection
   */
  start() {
    console.log('[Anomaly Detector] Starting continuous monitoring...')
    console.log(`[Anomaly Detector] Monitoring ${this.monitoredMetrics.length} metrics`)
    console.log(`[Anomaly Detector] Check interval: ${this.checkInterval / 1000}s`)

    this.intervalId = setInterval(async () => {
      try {
        const anomalies = await this.detectAnomalies()

        if (anomalies.length > 0) {
          console.log(`[Anomaly Detector] Detected ${anomalies.length} anomalies`)

          // Trigger remediation for each anomaly
          const { RemediationEngine } = await import('./remediation-engine.js')
          const remediation = new RemediationEngine()

          for (const anomaly of anomalies) {
            await remediation.triggerRemediation(anomaly)
          }
        }
      } catch (error) {
        console.error('[Anomaly Detector] Error in detection cycle:', error.message)
      }
    }, this.checkInterval)
  }

  /**
   * Stop anomaly detection
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      console.log('[Anomaly Detector] Stopped')
    }
  }
}

export default AnomalyDetector
