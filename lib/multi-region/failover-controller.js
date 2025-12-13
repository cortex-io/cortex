import RegionManager from './region-manager.js'
import CrossRegionReplicator from './cross-region-replicator.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Failover Controller
 *
 * Orchestrates failover and failback operations across regions
 * Integrates RegionManager and CrossRegionReplicator
 */

class FailoverController {
  constructor(configPath = null) {
    this.regionManager = new RegionManager(configPath)
    this.replicator = null
    this.failbackTimer = null
    this.initialized = false
  }

  /**
   * Initialize failover controller
   */
  async initialize() {
    console.log('[FailoverController] Initializing...')

    // Initialize region manager
    const regionStatus = await this.regionManager.initialize()

    // Initialize cross-region replicator
    this.replicator = new CrossRegionReplicator(this.regionManager.config)
    this.replicator.start()

    this.initialized = true

    console.log('[FailoverController] Initialization complete')
    console.log(`[FailoverController] Active region: ${regionStatus.active_region}`)
    console.log(`[FailoverController] Auto-failover: ${regionStatus.failover_enabled ? 'ENABLED' : 'DISABLED'}`)

    return regionStatus
  }

  /**
   * Trigger manual failover to specific region
   */
  async manualFailover(targetRegion) {
    if (!this.initialized) {
      throw new Error('FailoverController not initialized')
    }

    console.log(`[FailoverController] Manual failover requested to ${targetRegion}`)

    // Check if target region is healthy
    const regionHealth = this.regionManager.regionHealth[targetRegion]

    if (!regionHealth) {
      throw new Error(`Unknown region: ${targetRegion}`)
    }

    if (!regionHealth.healthy) {
      throw new Error(`Target region ${targetRegion} is unhealthy`)
    }

    // Disable auto-failover during manual failover
    const originalAutoFailover = this.regionManager.config.failover.auto_failover
    this.regionManager.config.failover.auto_failover = false

    try {
      // Force replication before failover
      const currentRegion = this.regionManager.activeRegion
      await this.replicator.forceReplication(currentRegion, targetRegion)

      // Perform failover
      await this.regionManager.initiateFailover()

      console.log(`[FailoverController] Manual failover to ${targetRegion} completed`)

      // Schedule failback if enabled
      if (this.regionManager.config.failover.failback_enabled) {
        await this.scheduleFailback(currentRegion)
      }

    } finally {
      // Restore auto-failover setting
      this.regionManager.config.failover.auto_failover = originalAutoFailover
    }
  }

  /**
   * Schedule automatic failback to primary region
   */
  async scheduleFailback(primaryRegion) {
    const delayMinutes = this.regionManager.config.failover.failback_delay_minutes
    const delayMs = delayMinutes * 60 * 1000

    console.log(`[FailoverController] Scheduling failback to ${primaryRegion} in ${delayMinutes} minutes`)

    if (this.failbackTimer) {
      clearTimeout(this.failbackTimer)
    }

    this.failbackTimer = setTimeout(async () => {
      await this.attemptFailback(primaryRegion)
    }, delayMs)
  }

  /**
   * Attempt failback to primary region
   */
  async attemptFailback(primaryRegion) {
    console.log(`[FailoverController] Attempting failback to ${primaryRegion}`)

    try {
      // Verify primary region is healthy
      const verificationMinutes = this.regionManager.config.failover.failback_verification_minutes
      const isHealthy = await this.verifyRegionHealth(primaryRegion, verificationMinutes)

      if (!isHealthy) {
        console.warn(`[FailoverController] Primary region ${primaryRegion} not yet healthy, delaying failback`)

        // Retry in 5 minutes
        this.failbackTimer = setTimeout(async () => {
          await this.attemptFailback(primaryRegion)
        }, 300000)

        return
      }

      console.log(`[FailoverController] Primary region ${primaryRegion} verified healthy, initiating failback`)

      // Force replication to primary before failing back
      const currentRegion = this.regionManager.activeRegion
      await this.replicator.forceReplication(currentRegion, primaryRegion)

      // Perform failback
      await this.regionManager.initiateFailover()

      console.log(`[FailoverController] Failback to ${primaryRegion} completed`)

      this.recordFailbackEvent(primaryRegion, true)

    } catch (error) {
      console.error(`[FailoverController] Failback to ${primaryRegion} failed:`, error.message)
      this.recordFailbackEvent(primaryRegion, false, error.message)
    }
  }

  /**
   * Verify region health over a period of time
   */
  async verifyRegionHealth(regionId, durationMinutes) {
    const checks = 5
    const intervalMs = (durationMinutes * 60 * 1000) / checks
    let healthyChecks = 0

    console.log(`[FailoverController] Verifying ${regionId} health over ${durationMinutes} minutes (${checks} checks)`)

    for (let i = 0; i < checks; i++) {
      const regionConfig = this.regionManager.config.regions[regionId]
      const health = await this.regionManager.checkRegionHealth(regionId, regionConfig)

      if (health.healthy) {
        healthyChecks++
      }

      if (i < checks - 1) {
        await new Promise(resolve => setTimeout(resolve, intervalMs))
      }
    }

    const healthyPercentage = (healthyChecks / checks) * 100

    console.log(`[FailoverController] Region ${regionId} health verification: ${healthyPercentage}% (${healthyChecks}/${checks} checks)`)

    return healthyPercentage >= 80 // 80% healthy threshold
  }

  /**
   * Get comprehensive failover status
   */
  getStatus() {
    const regionStatus = this.regionManager.getStatus()
    const replicationStats = this.replicator ? this.replicator.getStats() : null

    return {
      initialized: this.initialized,
      active_region: regionStatus.active_region,
      failover_in_progress: regionStatus.failover_in_progress,
      failback_scheduled: this.failbackTimer !== null,
      region_health: regionStatus.region_health,
      replication_stats: replicationStats,
      config: regionStatus.config
    }
  }

  /**
   * Get replication lag for all target regions
   */
  async getReplicationLag() {
    if (!this.replicator) {
      return {}
    }

    const targetRegions = this.regionManager.config.replication.coordination_state.target_regions
    const lags = {}

    for (const region of targetRegions) {
      lags[region] = await this.replicator.getReplicationLag(region)
    }

    return lags
  }

  /**
   * Validate failover readiness
   */
  async validateFailoverReadiness() {
    console.log('[FailoverController] Validating failover readiness...')

    const results = {
      ready: true,
      checks: []
    }

    // Check 1: At least one healthy failover target
    const healthyTargets = Object.entries(this.regionManager.regionHealth)
      .filter(([regionId, health]) => {
        return regionId !== this.regionManager.activeRegion && health.healthy
      })

    results.checks.push({
      name: 'healthy_failover_target',
      passed: healthyTargets.length > 0,
      message: `${healthyTargets.length} healthy failover target(s) available`
    })

    if (healthyTargets.length === 0) {
      results.ready = false
    }

    // Check 2: Replication lag within threshold
    const replicationLags = await this.getReplicationLag()
    const lagThreshold = this.regionManager.config.monitoring.replication_lag_threshold_seconds

    for (const [region, lag] of Object.entries(replicationLags)) {
      const withinThreshold = lag.lag_seconds !== null && lag.lag_seconds <= lagThreshold

      results.checks.push({
        name: `replication_lag_${region}`,
        passed: withinThreshold,
        message: `Replication lag: ${lag.lag_seconds}s (threshold: ${lagThreshold}s)`
      })

      if (!withinThreshold) {
        results.ready = false
      }
    }

    // Check 3: Replicator is running
    const replicatorRunning = this.replicator !== null

    results.checks.push({
      name: 'replicator_running',
      passed: replicatorRunning,
      message: replicatorRunning ? 'Replicator is running' : 'Replicator is not running'
    })

    if (!replicatorRunning) {
      results.ready = false
    }

    console.log(`[FailoverController] Failover readiness: ${results.ready ? 'READY' : 'NOT READY'}`)

    return results
  }

  /**
   * Record failback event
   */
  recordFailbackEvent(targetRegion, success, error = null) {
    try {
      const event = {
        event_type: 'failback',
        target_region: targetRegion,
        success,
        error,
        timestamp: new Date().toISOString()
      }

      const eventsPath = path.join(__dirname, '../../coordination/failback-events.jsonl')
      fs.appendFileSync(eventsPath, JSON.stringify(event) + '\n')

    } catch (error) {
      console.error('[FailoverController] Error recording failback event:', error.message)
    }
  }

  /**
   * Stop failover controller
   */
  stop() {
    console.log('[FailoverController] Stopping...')

    if (this.failbackTimer) {
      clearTimeout(this.failbackTimer)
    }

    if (this.regionManager) {
      this.regionManager.stop()
    }

    if (this.replicator) {
      this.replicator.stop()
    }

    console.log('[FailoverController] Stopped')
  }
}

export default FailoverController
