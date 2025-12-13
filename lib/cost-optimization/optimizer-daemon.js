import RecommendationEngine from './recommendation-engine.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Optimizer Daemon
 *
 * Continuously monitors and optimizes cluster resources
 * Runs daily analysis and applies low-risk optimizations automatically
 */

class OptimizerDaemon {
  constructor(config = {}) {
    this.engine = new RecommendationEngine()
    this.config = {
      analysisSchedule: config.analysisSchedule || '0 2 * * *', // 2 AM daily
      autoApply: config.autoApply !== undefined ? config.autoApply : true,
      autoApplyThreshold: config.autoApplyThreshold || 0.1,
      createPRForHighImpact: config.createPRForHighImpact !== undefined ? config.createPRForHighImpact : true,
      namespaces: config.namespaces || null, // null = all namespaces
      dryRun: config.dryRun || false
    }

    this.running = false
    this.analysisInterval = null
    this.analysisHistory = []
  }

  /**
   * Start optimizer daemon
   */
  async start() {
    console.log('[OptimizerDaemon] Starting...')
    console.log('[OptimizerDaemon] Configuration:', this.config)

    this.running = true

    // Run initial analysis
    await this.runAnalysis()

    // Schedule daily analysis
    this.scheduleAnalysis()

    console.log('[OptimizerDaemon] Started successfully')
  }

  /**
   * Schedule daily analysis
   */
  scheduleAnalysis() {
    // For simplicity, run every 24 hours
    // In production, use a proper cron scheduler
    const intervalMs = 24 * 60 * 60 * 1000 // 24 hours

    this.analysisInterval = setInterval(async () => {
      if (this.running) {
        await this.runAnalysis()
      }
    }, intervalMs)

    console.log('[OptimizerDaemon] Scheduled daily analysis')
  }

  /**
   * Run cost optimization analysis
   */
  async runAnalysis() {
    console.log('[OptimizerDaemon] ========================================')
    console.log('[OptimizerDaemon] Starting cost optimization analysis')
    console.log('[OptimizerDaemon] ========================================')

    const startTime = Date.now()

    try {
      // Generate recommendations
      const report = await this.engine.generateRecommendations(this.config.namespaces)

      console.log(`[OptimizerDaemon] Generated ${report.recommendations.length} recommendations`)

      // Process recommendations
      const results = await this.processRecommendations(report)

      const duration = Date.now() - startTime

      const analysisResult = {
        timestamp: new Date().toISOString(),
        duration_ms: duration,
        total_recommendations: report.recommendations.length,
        auto_applied: results.auto_applied.length,
        pr_created: results.pr_created,
        manual_review: results.manual_review.length,
        report,
        results
      }

      // Record in history
      this.recordAnalysis(analysisResult)

      console.log('[OptimizerDaemon] ========================================')
      console.log(`[OptimizerDaemon] Analysis complete (${duration}ms)`)
      console.log(`[OptimizerDaemon] Auto-applied: ${results.auto_applied.length}`)
      console.log(`[OptimizerDaemon] PR created: ${results.pr_created ? 'Yes' : 'No'}`)
      console.log(`[OptimizerDaemon] Manual review: ${results.manual_review.length}`)
      console.log('[OptimizerDaemon] ========================================')

      return analysisResult

    } catch (error) {
      console.error('[OptimizerDaemon] Analysis failed:', error.message)

      return {
        timestamp: new Date().toISOString(),
        error: error.message,
        success: false
      }
    }
  }

  /**
   * Process recommendations
   */
  async processRecommendations(report) {
    const results = {
      auto_applied: [],
      pr_created: false,
      manual_review: []
    }

    // Identify auto-apply candidates
    const autoApplyCandidates = report.auto_apply_candidates

    console.log(`[OptimizerDaemon] Auto-apply candidates: ${autoApplyCandidates.length}`)

    // Auto-apply low-impact recommendations
    if (this.config.autoApply && !this.config.dryRun) {
      for (const rec of autoApplyCandidates) {
        try {
          const result = await this.engine.applyRecommendation(rec)
          results.auto_applied.push(result)

          console.log(`[OptimizerDaemon] Auto-applied: ${rec.type} for ${rec.namespace}/${rec.deployment}`)
        } catch (error) {
          console.error(`[OptimizerDaemon] Failed to auto-apply:`, error.message)
        }
      }
    } else if (this.config.dryRun) {
      console.log('[OptimizerDaemon] Dry run mode - skipping auto-apply')
      results.auto_applied = autoApplyCandidates.map(rec => ({
        ...rec,
        dry_run: true
      }))
    }

    // Create PR for high-impact recommendations
    const highImpactRecs = report.recommendations.filter(
      rec => !autoApplyCandidates.includes(rec) && rec.severity !== 'low'
    )

    if (highImpactRecs.length > 0 && this.config.createPRForHighImpact && !this.config.dryRun) {
      try {
        const pr = await this.engine.createPR(highImpactRecs)
        results.pr_created = true
        results.pr = pr

        console.log(`[OptimizerDaemon] Created PR with ${highImpactRecs.length} recommendations`)
      } catch (error) {
        console.error('[OptimizerDaemon] Failed to create PR:', error.message)
      }
    } else if (this.config.dryRun) {
      console.log('[OptimizerDaemon] Dry run mode - skipping PR creation')
      results.pr_created = false
      results.pr = { dry_run: true, recommendations: highImpactRecs.length }
    }

    // Manual review recommendations (scale-to-zero, etc.)
    results.manual_review = report.recommendations.filter(
      rec => rec.type === 'scale_to_zero'
    )

    return results
  }

  /**
   * Record analysis in history
   */
  recordAnalysis(analysisResult) {
    this.analysisHistory.push(analysisResult)

    // Keep last 100 analyses
    if (this.analysisHistory.length > 100) {
      this.analysisHistory = this.analysisHistory.slice(-100)
    }

    // Persist to disk
    try {
      const historyPath = path.join(
        __dirname,
        '../../coordination/optimizer-history.jsonl'
      )

      fs.appendFileSync(historyPath, JSON.stringify(analysisResult) + '\n')
    } catch (error) {
      console.error('[OptimizerDaemon] Error persisting analysis:', error.message)
    }
  }

  /**
   * Get daemon statistics
   */
  getStats() {
    const totalAnalyses = this.analysisHistory.length
    const totalAutoApplied = this.analysisHistory.reduce(
      (sum, a) => sum + (a.results?.auto_applied?.length || 0),
      0
    )
    const totalPRs = this.analysisHistory.filter(a => a.results?.pr_created).length

    return {
      running: this.running,
      total_analyses: totalAnalyses,
      total_auto_applied: totalAutoApplied,
      total_prs_created: totalPRs,
      last_analysis: this.analysisHistory.length > 0
        ? this.analysisHistory[this.analysisHistory.length - 1]
        : null,
      config: this.config
    }
  }

  /**
   * Stop optimizer daemon
   */
  stop() {
    console.log('[OptimizerDaemon] Stopping...')

    this.running = false

    if (this.analysisInterval) {
      clearInterval(this.analysisInterval)
    }

    console.log('[OptimizerDaemon] Stopped')
  }
}

export default OptimizerDaemon
