import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import ResourceAnalyzer from './resource-analyzer.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Recommendation Engine for Cost Optimization
 *
 * Generates actionable cost optimization recommendations
 * Prioritizes recommendations by impact and risk
 */

class RecommendationEngine {
  constructor() {
    this.analyzer = new ResourceAnalyzer()
    this.autoApplyThreshold = 0.1 // Auto-apply if impact < 10%
    this.recommendationHistory = []
  }

  /**
   * Generate recommendations for cluster
   */
  async generateRecommendations(namespace = null) {
    console.log('[RecommendationEngine] Generating recommendations...')

    const analysis = await this.analyzer.analyzeCluster(namespace)

    // Prioritize recommendations
    const prioritized = this.prioritizeRecommendations(analysis)

    // Classify by action type
    const classified = this.classifyRecommendations(prioritized)

    // Generate action plan
    const actionPlan = this.generateActionPlan(classified)

    const report = {
      generated_at: new Date().toISOString(),
      summary: analysis.summary,
      recommendations: prioritized,
      classified: classified,
      action_plan: actionPlan,
      auto_apply_candidates: this.identifyAutoApplyCandidates(prioritized)
    }

    // Save report
    await this.saveReport(report)

    console.log(`[RecommendationEngine] Generated ${prioritized.length} recommendations`)

    return report
  }

  /**
   * Prioritize recommendations by impact and severity
   */
  prioritizeRecommendations(analysis) {
    const allRecommendations = []

    for (const deployment of analysis.deployments) {
      for (const rec of deployment.recommendations) {
        allRecommendations.push({
          ...rec,
          deployment: deployment.deployment,
          namespace: deployment.namespace,
          current_replicas: deployment.current_replicas
        })
      }
    }

    // Sort by severity (high first) then savings
    allRecommendations.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity]

      if (severityDiff !== 0) return severityDiff

      // Then by savings
      const aSavings = a.estimated_savings_percent || 0
      const bSavings = b.estimated_savings_percent || 0

      return bSavings - aSavings
    })

    return allRecommendations
  }

  /**
   * Classify recommendations by action type
   */
  classifyRecommendations(recommendations) {
    const classified = {
      scale_down: [],
      scale_up: [],
      right_size: [],
      remove: []
    }

    for (const rec of recommendations) {
      if (rec.type === 'scale_to_zero') {
        classified.remove.push(rec)
      } else if (rec.type.includes('scale_down')) {
        classified.scale_down.push(rec)
      } else if (rec.type.includes('scale_up')) {
        classified.scale_up.push(rec)
      } else {
        classified.right_size.push(rec)
      }
    }

    return {
      scale_down: {
        count: classified.scale_down.length,
        total_savings_percent: this.calculateTotalSavings(classified.scale_down),
        recommendations: classified.scale_down
      },
      scale_up: {
        count: classified.scale_up.length,
        total_cost_increase_percent: this.calculateTotalCostIncrease(classified.scale_up),
        recommendations: classified.scale_up
      },
      right_size: {
        count: classified.right_size.length,
        recommendations: classified.right_size
      },
      remove: {
        count: classified.remove.length,
        total_savings_percent: 100,
        recommendations: classified.remove
      }
    }
  }

  /**
   * Calculate total savings percentage
   */
  calculateTotalSavings(recommendations) {
    const total = recommendations.reduce(
      (sum, r) => sum + (r.estimated_savings_percent || 0),
      0
    )

    return recommendations.length > 0 ? Math.round(total / recommendations.length) : 0
  }

  /**
   * Calculate total cost increase percentage
   */
  calculateTotalCostIncrease(recommendations) {
    const total = recommendations.reduce(
      (sum, r) => sum + (r.estimated_cost_increase_percent || 0),
      0
    )

    return recommendations.length > 0 ? Math.round(total / recommendations.length) : 0
  }

  /**
   * Generate action plan
   */
  generateActionPlan(classified) {
    const phases = []

    // Phase 1: Critical scale-ups (prevent resource exhaustion)
    const criticalScaleUps = classified.scale_up.recommendations.filter(r => r.severity === 'high')
    if (criticalScaleUps.length > 0) {
      phases.push({
        phase: 1,
        name: 'Critical Scale-Ups',
        priority: 'critical',
        actions: criticalScaleUps.length,
        estimated_impact: 'Prevent resource exhaustion and performance degradation',
        recommendations: criticalScaleUps
      })
    }

    // Phase 2: Low-risk scale-downs (auto-apply candidates)
    const lowRiskScaleDowns = classified.scale_down.recommendations.filter(
      r => r.impact === 'low' && (r.estimated_savings_percent || 0) < this.autoApplyThreshold * 100
    )
    if (lowRiskScaleDowns.length > 0) {
      phases.push({
        phase: 2,
        name: 'Low-Risk Optimizations (Auto-Apply)',
        priority: 'medium',
        actions: lowRiskScaleDowns.length,
        estimated_impact: `${this.calculateTotalSavings(lowRiskScaleDowns)}% average savings`,
        auto_apply: true,
        recommendations: lowRiskScaleDowns
      })
    }

    // Phase 3: Medium-risk scale-downs (requires review)
    const mediumRiskScaleDowns = classified.scale_down.recommendations.filter(
      r => !lowRiskScaleDowns.includes(r)
    )
    if (mediumRiskScaleDowns.length > 0) {
      phases.push({
        phase: 3,
        name: 'Medium-Risk Optimizations (Requires Review)',
        priority: 'medium',
        actions: mediumRiskScaleDowns.length,
        estimated_impact: `${this.calculateTotalSavings(mediumRiskScaleDowns)}% average savings`,
        auto_apply: false,
        requires_pr: true,
        recommendations: mediumRiskScaleDowns
      })
    }

    // Phase 4: Removal candidates (requires manual review)
    if (classified.remove.count > 0) {
      phases.push({
        phase: 4,
        name: 'Removal Candidates (Manual Review Required)',
        priority: 'low',
        actions: classified.remove.count,
        estimated_impact: 'Remove unused deployments',
        auto_apply: false,
        requires_manual_review: true,
        recommendations: classified.remove.recommendations
      })
    }

    return {
      total_phases: phases.length,
      phases,
      estimated_total_savings: this.calculateTotalSavings([
        ...classified.scale_down.recommendations,
        ...classified.remove.recommendations
      ])
    }
  }

  /**
   * Identify auto-apply candidates
   */
  identifyAutoApplyCandidates(recommendations) {
    return recommendations.filter(rec => {
      const savings = rec.estimated_savings_percent || 0
      return rec.impact === 'low' && savings < this.autoApplyThreshold * 100
    })
  }

  /**
   * Apply recommendation
   */
  async applyRecommendation(recommendation) {
    console.log(`[RecommendationEngine] Applying recommendation: ${recommendation.type} for ${recommendation.namespace}/${recommendation.deployment}`)

    // In production, this would update Kubernetes resources
    // For now, we'll simulate it

    const result = {
      success: true,
      recommendation_id: recommendation.id || `rec-${Date.now()}`,
      deployment: recommendation.deployment,
      namespace: recommendation.namespace,
      action: recommendation.type,
      previous_value: recommendation.current_value,
      new_value: recommendation.recommended_value,
      applied_at: new Date().toISOString()
    }

    // Record in history
    this.recordApplication(result)

    return result
  }

  /**
   * Create PR for recommendations
   */
  async createPR(recommendations) {
    console.log(`[RecommendationEngine] Creating PR for ${recommendations.length} recommendations`)

    const prBody = this.generatePRDescription(recommendations)

    // In production, this would use GitHub API
    const pr = {
      title: `[Cost Optimization] Right-size deployments - ${recommendations.length} recommendations`,
      body: prBody,
      labels: ['cost-optimization', 'automated'],
      created_at: new Date().toISOString()
    }

    console.log('[RecommendationEngine] PR created:', pr.title)

    return pr
  }

  /**
   * Generate PR description
   */
  generatePRDescription(recommendations) {
    const lines = []

    lines.push('## Cost Optimization Recommendations')
    lines.push('')
    lines.push(`This PR implements ${recommendations.length} cost optimization recommendations.`)
    lines.push('')
    lines.push('### Summary')
    lines.push('')

    const savings = this.calculateTotalSavings(recommendations)
    lines.push(`- **Estimated Savings**: ${savings}%`)
    lines.push(`- **Deployments Affected**: ${new Set(recommendations.map(r => r.deployment)).size}`)
    lines.push('')
    lines.push('### Recommendations')
    lines.push('')

    for (const rec of recommendations) {
      lines.push(`#### ${rec.namespace}/${rec.deployment}`)
      lines.push('')
      lines.push(`- **Type**: ${rec.type}`)
      lines.push(`- **Current**: ${rec.current_value}`)
      lines.push(`- **Recommended**: ${rec.recommended_value}`)
      lines.push(`- **Utilization**: ${rec.utilization}%`)
      lines.push(`- **Impact**: ${rec.impact}`)
      if (rec.estimated_savings_percent) {
        lines.push(`- **Savings**: ${rec.estimated_savings_percent}%`)
      }
      lines.push('')
    }

    lines.push('---')
    lines.push('*This PR was automatically generated by Cortex Cost Optimization Engine*')

    return lines.join('\n')
  }

  /**
   * Save recommendation report
   */
  async saveReport(report) {
    try {
      const reportPath = path.join(
        __dirname,
        '../../coordination/cost-optimization-reports',
        `report-${Date.now()}.json`
      )

      const dir = path.dirname(reportPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))

      console.log(`[RecommendationEngine] Report saved to ${reportPath}`)

    } catch (error) {
      console.error('[RecommendationEngine] Error saving report:', error.message)
    }
  }

  /**
   * Record recommendation application
   */
  recordApplication(result) {
    this.recommendationHistory.push(result)

    try {
      const historyPath = path.join(
        __dirname,
        '../../coordination/cost-optimization-history.jsonl'
      )

      fs.appendFileSync(historyPath, JSON.stringify(result) + '\n')
    } catch (error) {
      console.error('[RecommendationEngine] Error recording application:', error.message)
    }
  }

  /**
   * Get optimization statistics
   */
  getStats() {
    const totalApplications = this.recommendationHistory.length
    const successfulApplications = this.recommendationHistory.filter(r => r.success).length

    return {
      total_applications: totalApplications,
      successful_applications: successfulApplications,
      success_rate: totalApplications > 0 ? successfulApplications / totalApplications : 0,
      last_application: this.recommendationHistory.length > 0
        ? this.recommendationHistory[this.recommendationHistory.length - 1]
        : null
    }
  }
}

export default RecommendationEngine
