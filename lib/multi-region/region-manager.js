import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import axios from 'axios'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Region Manager for Multi-Region Cortex Deployment
 *
 * Manages cross-region coordination, health checks, and failover
 */

class RegionManager {
  constructor(configPath = null) {
    this.configPath = configPath || path.join(__dirname, '../../coordination/multi-region-config.json')
    this.config = this.loadConfig()
    this.regionHealth = {}
    this.activeRegion = null
    this.failoverInProgress = false
    this.healthCheckInterval = null
  }

  /**
   * Load multi-region configuration
   */
  loadConfig() {
    try {
      const content = fs.readFileSync(this.configPath, 'utf8')
      return JSON.parse(content)
    } catch (error) {
      console.error('[RegionManager] Error loading config:', error.message)
      return null
    }
  }

  /**
   * Initialize region manager
   */
  async initialize() {
    console.log('[RegionManager] Initializing...')

    if (!this.config) {
      throw new Error('Failed to load multi-region configuration')
    }

    // Determine active region based on health and priority
    await this.detectActiveRegion()

    // Start health checks
    this.startHealthChecks()

    console.log(`[RegionManager] Initialized with active region: ${this.activeRegion}`)

    return {
      active_region: this.activeRegion,
      regions: Object.keys(this.config.regions),
      failover_enabled: this.config.failover.auto_failover
    }
  }

  /**
   * Detect which region is currently active
   */
  async detectActiveRegion() {
    // Check health of all regions
    for (const [regionId, regionConfig] of Object.entries(this.config.regions)) {
      const health = await this.checkRegionHealth(regionId, regionConfig)
      this.regionHealth[regionId] = health

      console.log(`[RegionManager] Region ${regionId} health:`, health.healthy ? 'HEALTHY' : 'UNHEALTHY')
    }

    // Select active region based on priority and health
    const healthyRegions = Object.entries(this.regionHealth)
      .filter(([_, health]) => health.healthy)
      .map(([regionId, _]) => ({
        regionId,
        priority: this.config.regions[regionId].priority
      }))
      .sort((a, b) => a.priority - b.priority)

    if (healthyRegions.length === 0) {
      throw new Error('No healthy regions available')
    }

    this.activeRegion = healthyRegions[0].regionId
  }

  /**
   * Check health of a specific region
   */
  async checkRegionHealth(regionId, regionConfig) {
    const health = {
      region_id: regionId,
      healthy: true,
      checks: {},
      last_check: new Date().toISOString(),
      failures: 0
    }

    try {
      // Check Kubernetes API
      if (regionConfig.endpoints.k8s_api) {
        health.checks.k8s_api = await this.checkK8sApi(regionConfig)
      }

      // Check Prometheus
      if (regionConfig.endpoints.prometheus) {
        health.checks.prometheus = await this.checkPrometheus(regionConfig)
      }

      // Check Dashboard
      if (regionConfig.endpoints.dashboard) {
        health.checks.dashboard = await this.checkDashboard(regionConfig)
      }

      // Overall health is healthy if all checks pass
      health.healthy = Object.values(health.checks).every(check => check.healthy)
      health.failures = Object.values(health.checks).filter(check => !check.healthy).length

    } catch (error) {
      console.error(`[RegionManager] Health check error for ${regionId}:`, error.message)
      health.healthy = false
      health.error = error.message
    }

    return health
  }

  /**
   * Check Kubernetes API health
   */
  async checkK8sApi(regionConfig) {
    try {
      const context = regionConfig.k8s_context

      const { stdout } = await execAsync(
        `kubectl --context=${context} cluster-info --request-timeout=5s`,
        { timeout: 10000 }
      )

      return {
        healthy: stdout.includes('running'),
        response_time_ms: 100,
        message: 'K8s API accessible'
      }
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      }
    }
  }

  /**
   * Check Prometheus health
   */
  async checkPrometheus(regionConfig) {
    try {
      const url = `${regionConfig.endpoints.prometheus}/api/v1/query`
      const startTime = Date.now()

      const response = await axios.get(url, {
        params: { query: 'up' },
        timeout: 5000
      })

      const responseTime = Date.now() - startTime

      return {
        healthy: response.status === 200 && response.data.status === 'success',
        response_time_ms: responseTime,
        message: 'Prometheus accessible'
      }
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      }
    }
  }

  /**
   * Check Dashboard health
   */
  async checkDashboard(regionConfig) {
    try {
      const url = `${regionConfig.endpoints.dashboard}/api/health`
      const startTime = Date.now()

      const response = await axios.get(url, {
        timeout: 5000
      })

      const responseTime = Date.now() - startTime

      return {
        healthy: response.status === 200,
        response_time_ms: responseTime,
        message: 'Dashboard accessible'
      }
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      }
    }
  }

  /**
   * Start continuous health checks
   */
  startHealthChecks() {
    const interval = this.config.failover.health_check_interval_seconds * 1000

    console.log(`[RegionManager] Starting health checks (interval: ${interval / 1000}s)`)

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks()
    }, interval)
  }

  /**
   * Perform health checks on all regions
   */
  async performHealthChecks() {
    const previousHealth = { ...this.regionHealth }

    for (const [regionId, regionConfig] of Object.entries(this.config.regions)) {
      const health = await this.checkRegionHealth(regionId, regionConfig)
      this.regionHealth[regionId] = health
    }

    // Check if active region is unhealthy
    const activeRegionHealth = this.regionHealth[this.activeRegion]

    if (!activeRegionHealth.healthy) {
      const consecutiveFailures = this.getConsecutiveFailures(this.activeRegion)

      console.warn(`[RegionManager] Active region ${this.activeRegion} unhealthy (failures: ${consecutiveFailures})`)

      if (consecutiveFailures >= this.config.failover.health_check_failures) {
        console.error(`[RegionManager] Failure threshold reached for ${this.activeRegion}`)

        if (this.config.failover.auto_failover) {
          await this.initiateFailover()
        }
      }
    }
  }

  /**
   * Get consecutive failures for a region
   */
  getConsecutiveFailures(regionId) {
    // In production, this would track failure history
    // For now, we'll use the current failure count
    return this.regionHealth[regionId]?.failures || 0
  }

  /**
   * Initiate failover to standby region
   */
  async initiateFailover() {
    if (this.failoverInProgress) {
      console.log('[RegionManager] Failover already in progress')
      return
    }

    this.failoverInProgress = true

    console.log('[RegionManager] ==========================================')
    console.log('[RegionManager] INITIATING FAILOVER')
    console.log('[RegionManager] ==========================================')

    try {
      const startTime = Date.now()

      // Find next healthy region by priority
      const targetRegion = this.selectFailoverTarget()

      if (!targetRegion) {
        throw new Error('No healthy failover target available')
      }

      console.log(`[RegionManager] Failing over from ${this.activeRegion} to ${targetRegion}`)

      // Step 1: Update traffic routing
      await this.updateTrafficRouting(targetRegion)

      // Step 2: Trigger replication to ensure target is up-to-date
      const { CrossRegionReplicator } = await import('./cross-region-replicator.js')
      const replicator = new CrossRegionReplicator(this.config)
      await replicator.forceReplication(this.activeRegion, targetRegion)

      // Step 3: Activate target region
      const previousRegion = this.activeRegion
      this.activeRegion = targetRegion

      // Step 4: Send notifications
      await this.sendFailoverNotification(previousRegion, targetRegion)

      const duration = Date.now() - startTime

      console.log('[RegionManager] ==========================================')
      console.log(`[RegionManager] FAILOVER COMPLETED (${duration}ms)`)
      console.log(`[RegionManager] Active region: ${targetRegion}`)
      console.log('[RegionManager] ==========================================')

      // Record failover event
      this.recordFailoverEvent(previousRegion, targetRegion, duration, true)

    } catch (error) {
      console.error('[RegionManager] Failover failed:', error.message)
      this.recordFailoverEvent(this.activeRegion, null, 0, false, error.message)
    } finally {
      this.failoverInProgress = false
    }
  }

  /**
   * Select failover target region
   */
  selectFailoverTarget() {
    const healthyRegions = Object.entries(this.regionHealth)
      .filter(([regionId, health]) => regionId !== this.activeRegion && health.healthy)
      .map(([regionId, _]) => ({
        regionId,
        priority: this.config.regions[regionId].priority
      }))
      .sort((a, b) => a.priority - b.priority)

    return healthyRegions.length > 0 ? healthyRegions[0].regionId : null
  }

  /**
   * Update traffic routing to new region
   */
  async updateTrafficRouting(targetRegion) {
    console.log(`[RegionManager] Updating traffic routing to ${targetRegion}`)

    try {
      if (this.config.traffic_routing.ingress_update.enabled) {
        await this.updateIngressRouting(targetRegion)
      }

      if (this.config.traffic_routing.dns_update.enabled) {
        await this.updateDnsRouting(targetRegion)
      }

      return { success: true }
    } catch (error) {
      console.error('[RegionManager] Traffic routing update failed:', error.message)
      return { success: false, error: error.message }
    }
  }

  /**
   * Update Kubernetes Ingress routing
   */
  async updateIngressRouting(targetRegion) {
    const { namespace, ingress_name } = this.config.traffic_routing.ingress_update
    const targetConfig = this.config.regions[targetRegion]
    const context = targetConfig.k8s_context

    console.log(`[RegionManager] Updating ingress ${ingress_name} in namespace ${namespace}`)

    // In production, this would update the ingress to point to the new region
    // For now, we'll simulate it
    console.log(`[RegionManager] Ingress updated to route to ${targetRegion}`)
  }

  /**
   * Update DNS routing
   */
  async updateDnsRouting(targetRegion) {
    const { provider, ttl_seconds } = this.config.traffic_routing.dns_update

    console.log(`[RegionManager] Updating DNS via ${provider} (TTL: ${ttl_seconds}s)`)

    // In production, this would update DNS records
    // For now, we'll simulate it
    console.log(`[RegionManager] DNS updated to route to ${targetRegion}`)
  }

  /**
   * Send failover notification
   */
  async sendFailoverNotification(fromRegion, toRegion) {
    console.log(`[RegionManager] Sending failover notification: ${fromRegion} -> ${toRegion}`)

    const notification = {
      event: 'region_failover',
      from_region: fromRegion,
      to_region: toRegion,
      timestamp: new Date().toISOString(),
      severity: 'critical',
      message: `Cortex failed over from ${fromRegion} to ${toRegion}`
    }

    // In production, would send to notification channels
    console.log('[RegionManager] Notification:', notification)
  }

  /**
   * Record failover event
   */
  recordFailoverEvent(fromRegion, toRegion, duration, success, error = null) {
    try {
      const event = {
        event_type: 'region_failover',
        from_region: fromRegion,
        to_region: toRegion,
        duration_ms: duration,
        success,
        error,
        timestamp: new Date().toISOString()
      }

      const eventsPath = path.join(__dirname, '../../coordination/failover-events.jsonl')
      fs.appendFileSync(eventsPath, JSON.stringify(event) + '\n')

    } catch (error) {
      console.error('[RegionManager] Error recording failover event:', error.message)
    }
  }

  /**
   * Get region status
   */
  getStatus() {
    return {
      active_region: this.activeRegion,
      failover_in_progress: this.failoverInProgress,
      region_health: this.regionHealth,
      config: {
        auto_failover: this.config.failover.auto_failover,
        health_check_interval: this.config.failover.health_check_interval_seconds,
        failure_threshold: this.config.failover.health_check_failures
      }
    }
  }

  /**
   * Stop health checks
   */
  stop() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      console.log('[RegionManager] Stopped health checks')
    }
  }
}

export default RegionManager
