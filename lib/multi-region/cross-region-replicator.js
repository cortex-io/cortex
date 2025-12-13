import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { exec } from 'child_process'
import { promisify } from 'util'
import zlib from 'zlib'
import crypto from 'crypto'

const execAsync = promisify(exec)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Cross-Region Replicator for Cortex
 *
 * Replicates coordination state, knowledge bases, and configuration
 * across multiple regions for disaster recovery and failover
 */

class CrossRegionReplicator {
  constructor(config) {
    this.config = config
    this.replicationHistory = []
    this.maxHistorySize = 500
    this.replicationIntervals = {}
  }

  /**
   * Start continuous replication
   */
  start() {
    console.log('[CrossRegionReplicator] Starting...')

    // Start coordination state replication
    if (this.config.replication.coordination_state.enabled) {
      const interval = this.config.replication.coordination_state.interval_seconds * 1000

      this.replicationIntervals.coordination = setInterval(async () => {
        await this.replicateCoordinationState()
      }, interval)

      console.log(`[CrossRegionReplicator] Coordination state replication started (interval: ${interval / 1000}s)`)
    }

    // Start knowledge base replication
    if (this.config.replication.knowledge_bases.enabled) {
      const interval = this.config.replication.knowledge_bases.interval_seconds * 1000

      this.replicationIntervals.knowledge_bases = setInterval(async () => {
        await this.replicateKnowledgeBases()
      }, interval)

      console.log(`[CrossRegionReplicator] Knowledge base replication started (interval: ${interval / 1000}s)`)
    }

    console.log('[CrossRegionReplicator] Started successfully')
  }

  /**
   * Replicate coordination state to target regions
   */
  async replicateCoordinationState() {
    const { target_regions, replicate_paths, compression, encryption } = this.config.replication.coordination_state

    console.log('[CrossRegionReplicator] Replicating coordination state...')

    const startTime = Date.now()
    let totalBytes = 0
    let totalFiles = 0

    try {
      for (const targetRegion of target_regions) {
        const targetConfig = this.config.regions[targetRegion]

        if (!targetConfig) {
          console.warn(`[CrossRegionReplicator] Unknown target region: ${targetRegion}`)
          continue
        }

        for (const pathPattern of replicate_paths) {
          const files = await this.expandPathPattern(pathPattern)

          for (const file of files) {
            const result = await this.replicateFile(file, targetRegion, {
              compression,
              encryption
            })

            if (result.success) {
              totalBytes += result.bytes
              totalFiles++
            }
          }
        }
      }

      const duration = Date.now() - startTime

      console.log(`[CrossRegionReplicator] Coordination state replicated: ${totalFiles} files, ${this.formatBytes(totalBytes)} in ${duration}ms`)

      this.recordReplication('coordination_state', totalFiles, totalBytes, duration, true)

    } catch (error) {
      console.error('[CrossRegionReplicator] Coordination state replication failed:', error.message)
      this.recordReplication('coordination_state', 0, 0, 0, false, error.message)
    }
  }

  /**
   * Replicate knowledge bases to target regions
   */
  async replicateKnowledgeBases() {
    const { target_regions, replicate_paths, compression, encryption } = this.config.replication.knowledge_bases

    console.log('[CrossRegionReplicator] Replicating knowledge bases...')

    const startTime = Date.now()
    let totalBytes = 0
    let totalFiles = 0

    try {
      for (const targetRegion of target_regions) {
        for (const pathPattern of replicate_paths) {
          const files = await this.expandPathPattern(pathPattern)

          for (const file of files) {
            const result = await this.replicateFile(file, targetRegion, {
              compression,
              encryption
            })

            if (result.success) {
              totalBytes += result.bytes
              totalFiles++
            }
          }
        }
      }

      const duration = Date.now() - startTime

      console.log(`[CrossRegionReplicator] Knowledge bases replicated: ${totalFiles} files, ${this.formatBytes(totalBytes)} in ${duration}ms`)

      this.recordReplication('knowledge_bases', totalFiles, totalBytes, duration, true)

    } catch (error) {
      console.error('[CrossRegionReplicator] Knowledge base replication failed:', error.message)
      this.recordReplication('knowledge_bases', 0, 0, 0, false, error.message)
    }
  }

  /**
   * Expand path pattern with wildcards
   */
  async expandPathPattern(pattern) {
    const cortexRoot = path.join(__dirname, '../..')
    const fullPattern = path.join(cortexRoot, pattern)

    try {
      // Use find for glob patterns
      const { stdout } = await execAsync(
        `find ${path.dirname(fullPattern)} -path "${fullPattern}" -type f 2>/dev/null || true`
      )

      return stdout
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.trim())
    } catch (error) {
      console.error(`[CrossRegionReplicator] Error expanding pattern ${pattern}:`, error.message)
      return []
    }
  }

  /**
   * Replicate a single file to target region
   */
  async replicateFile(filePath, targetRegion, options = {}) {
    try {
      // Read source file
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' }
      }

      let data = fs.readFileSync(filePath)
      let bytes = data.length

      // Compress if enabled
      if (options.compression) {
        data = await this.compress(data)
      }

      // Encrypt if enabled
      if (options.encryption) {
        data = await this.encrypt(data)
      }

      // In production, this would use kubectl cp, rsync, S3, or other transfer method
      // For now, we'll simulate by writing to a local replication directory
      const replicationDir = path.join(__dirname, '../../coordination/replication', targetRegion)
      const relativePath = filePath.replace(path.join(__dirname, '../..'), '')
      const targetPath = path.join(replicationDir, relativePath)
      const targetDir = path.dirname(targetPath)

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }

      fs.writeFileSync(targetPath, data)

      return {
        success: true,
        bytes,
        compressed_bytes: data.length,
        compression_ratio: options.compression ? (bytes / data.length).toFixed(2) : 1
      }

    } catch (error) {
      console.error(`[CrossRegionReplicator] Error replicating ${filePath}:`, error.message)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Compress data using gzip
   */
  async compress(data) {
    return new Promise((resolve, reject) => {
      zlib.gzip(data, (error, compressed) => {
        if (error) reject(error)
        else resolve(compressed)
      })
    })
  }

  /**
   * Decompress data
   */
  async decompress(data) {
    return new Promise((resolve, reject) => {
      zlib.gunzip(data, (error, decompressed) => {
        if (error) reject(error)
        else resolve(decompressed)
      })
    })
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  async encrypt(data) {
    // In production, use proper key management (KMS, Vault, etc.)
    const key = crypto.randomBytes(32)
    const iv = crypto.randomBytes(16)

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

    const encrypted = Buffer.concat([
      cipher.update(data),
      cipher.final()
    ])

    const authTag = cipher.getAuthTag()

    // Return key + iv + authTag + encrypted data
    // In production, key would be stored securely, not embedded
    return Buffer.concat([key, iv, authTag, encrypted])
  }

  /**
   * Decrypt data
   */
  async decrypt(data) {
    // Extract key, iv, authTag, and encrypted data
    const key = data.slice(0, 32)
    const iv = data.slice(32, 48)
    const authTag = data.slice(48, 64)
    const encrypted = data.slice(64)

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ])
  }

  /**
   * Force immediate replication (for failover scenarios)
   */
  async forceReplication(sourceRegion, targetRegion) {
    console.log(`[CrossRegionReplicator] Forcing replication: ${sourceRegion} -> ${targetRegion}`)

    const startTime = Date.now()

    try {
      // Replicate coordination state immediately
      await this.replicateCoordinationState()

      // Replicate knowledge bases immediately
      await this.replicateKnowledgeBases()

      const duration = Date.now() - startTime

      console.log(`[CrossRegionReplicator] Force replication completed in ${duration}ms`)

      return {
        success: true,
        duration
      }

    } catch (error) {
      console.error('[CrossRegionReplicator] Force replication failed:', error.message)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Get replication lag for a target region
   */
  async getReplicationLag(targetRegion) {
    try {
      const replicationDir = path.join(__dirname, '../../coordination/replication', targetRegion)

      if (!fs.existsSync(replicationDir)) {
        return { lag_seconds: null, error: 'No replication data' }
      }

      // Find most recently replicated file
      const { stdout } = await execAsync(
        `find ${replicationDir} -type f -printf '%T@\\n' | sort -n | tail -1`
      )

      if (!stdout.trim()) {
        return { lag_seconds: null, error: 'No files found' }
      }

      const lastReplicationTime = parseFloat(stdout.trim()) * 1000
      const now = Date.now()
      const lagSeconds = (now - lastReplicationTime) / 1000

      return {
        lag_seconds: lagSeconds,
        last_replication: new Date(lastReplicationTime).toISOString(),
        within_threshold: lagSeconds <= this.config.monitoring.replication_lag_threshold_seconds
      }

    } catch (error) {
      console.error(`[CrossRegionReplicator] Error getting replication lag for ${targetRegion}:`, error.message)
      return {
        lag_seconds: null,
        error: error.message
      }
    }
  }

  /**
   * Record replication event
   */
  recordReplication(type, files, bytes, duration, success, error = null) {
    const event = {
      type,
      files,
      bytes,
      duration_ms: duration,
      success,
      error,
      timestamp: new Date().toISOString()
    }

    this.replicationHistory.push(event)

    if (this.replicationHistory.length > this.maxHistorySize) {
      this.replicationHistory = this.replicationHistory.slice(-this.maxHistorySize)
    }

    // Persist to disk
    try {
      const historyPath = path.join(__dirname, '../../coordination/replication-history.jsonl')
      fs.appendFileSync(historyPath, JSON.stringify(event) + '\n')
    } catch (error) {
      console.error('[CrossRegionReplicator] Error persisting replication history:', error.message)
    }
  }

  /**
   * Get replication statistics
   */
  getStats() {
    const recent = this.replicationHistory.filter(r => {
      const age = Date.now() - new Date(r.timestamp).getTime()
      return age < 3600000 // Last hour
    })

    const totalBytes = recent.reduce((sum, r) => sum + r.bytes, 0)
    const totalFiles = recent.reduce((sum, r) => sum + r.files, 0)
    const successCount = recent.filter(r => r.success).length
    const successRate = recent.length > 0 ? successCount / recent.length : 0

    return {
      total_replications: this.replicationHistory.length,
      recent_1h: recent.length,
      recent_1h_bytes: totalBytes,
      recent_1h_files: totalFiles,
      success_rate: successRate,
      last_replication: this.replicationHistory.length > 0
        ? this.replicationHistory[this.replicationHistory.length - 1]
        : null
    }
  }

  /**
   * Format bytes for display
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes'

    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  /**
   * Stop replication
   */
  stop() {
    for (const [name, intervalId] of Object.entries(this.replicationIntervals)) {
      clearInterval(intervalId)
      console.log(`[CrossRegionReplicator] Stopped ${name} replication`)
    }
  }
}

export default CrossRegionReplicator
