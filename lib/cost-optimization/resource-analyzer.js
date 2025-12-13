import axios from 'axios'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * Resource Analyzer for Cost Optimization
 *
 * Analyzes Kubernetes resource utilization and identifies optimization opportunities
 * Uses Prometheus metrics to determine right-sizing recommendations
 */

class ResourceAnalyzer {
  constructor(prometheusUrl = 'http://prometheus.monitoring.svc.cluster.local:9090') {
    this.prometheusUrl = prometheusUrl
    this.analysisWindow = '24h'
    this.utilizationThresholds = {
      cpu_overprovisioned: 0.3,      // <30% utilization
      cpu_underprovisioned: 0.8,     // >80% utilization
      memory_overprovisioned: 0.3,   // <30% utilization
      memory_underprovisioned: 0.8,  // >80% utilization
      optimal_min: 0.4,              // 40% utilization
      optimal_max: 0.7               // 70% utilization
    }
  }

  /**
   * Analyze all deployments in cluster
   */
  async analyzeCluster(namespace = null) {
    console.log('[ResourceAnalyzer] Starting cluster-wide analysis...')

    const deployments = await this.getDeployments(namespace)
    const recommendations = []

    for (const deployment of deployments) {
      const analysis = await this.analyzeDeployment(deployment)

      if (analysis.recommendations.length > 0) {
        recommendations.push(analysis)
      }
    }

    const summary = {
      total_deployments: deployments.length,
      deployments_analyzed: recommendations.length,
      total_recommendations: recommendations.reduce((sum, r) => sum + r.recommendations.length, 0),
      potential_savings: this.calculatePotentialSavings(recommendations),
      timestamp: new Date().toISOString()
    }

    console.log(`[ResourceAnalyzer] Analysis complete: ${summary.total_recommendations} recommendations`)

    return {
      summary,
      deployments: recommendations
    }
  }

  /**
   * Get all deployments in cluster or namespace
   */
  async getDeployments(namespace = null) {
    try {
      const namespaceFlag = namespace ? `-n ${namespace}` : '--all-namespaces'

      const { stdout } = await execAsync(
        `kubectl get deployments ${namespaceFlag} -o json`
      )

      const result = JSON.parse(stdout)

      return result.items.map(item => ({
        name: item.metadata.name,
        namespace: item.metadata.namespace,
        replicas: item.spec.replicas,
        containers: item.spec.template.spec.containers.map(c => ({
          name: c.name,
          resources: c.resources
        }))
      }))
    } catch (error) {
      console.error('[ResourceAnalyzer] Error getting deployments:', error.message)
      return []
    }
  }

  /**
   * Analyze a single deployment
   */
  async analyzeDeployment(deployment) {
    console.log(`[ResourceAnalyzer] Analyzing ${deployment.namespace}/${deployment.name}`)

    const recommendations = []

    // Analyze CPU utilization
    const cpuAnalysis = await this.analyzeCPU(deployment)
    if (cpuAnalysis.recommendation) {
      recommendations.push(cpuAnalysis.recommendation)
    }

    // Analyze memory utilization
    const memoryAnalysis = await this.analyzeMemory(deployment)
    if (memoryAnalysis.recommendation) {
      recommendations.push(memoryAnalysis.recommendation)
    }

    // Analyze replica count
    const replicaAnalysis = await this.analyzeReplicas(deployment)
    if (replicaAnalysis.recommendation) {
      recommendations.push(replicaAnalysis.recommendation)
    }

    return {
      deployment: deployment.name,
      namespace: deployment.namespace,
      current_replicas: deployment.replicas,
      recommendations,
      utilization: {
        cpu: cpuAnalysis.utilization,
        memory: memoryAnalysis.utilization
      }
    }
  }

  /**
   * Analyze CPU utilization
   */
  async analyzeCPU(deployment) {
    try {
      const query = `
        sum(rate(container_cpu_usage_seconds_total{
          namespace="${deployment.namespace}",
          pod=~"${deployment.name}.*"
        }[${this.analysisWindow}])) /
        sum(kube_pod_container_resource_requests{
          namespace="${deployment.namespace}",
          pod=~"${deployment.name}.*",
          resource="cpu"
        })
      `

      const utilization = await this.queryPrometheus(query)

      if (utilization === null) {
        return { utilization: null, recommendation: null }
      }

      const currentCPU = await this.getCurrentCPURequest(deployment)
      let recommendation = null

      if (utilization < this.utilizationThresholds.cpu_overprovisioned) {
        // Over-provisioned - can reduce
        const recommendedCPU = this.calculateRightSizedCPU(currentCPU, utilization)

        recommendation = {
          type: 'scale_down_cpu',
          severity: 'medium',
          current_value: currentCPU,
          recommended_value: recommendedCPU,
          utilization: Math.round(utilization * 100),
          impact: 'low',
          estimated_savings_percent: Math.round(((currentCPU - recommendedCPU) / currentCPU) * 100),
          message: `CPU over-provisioned (${Math.round(utilization * 100)}% utilization). Reduce from ${currentCPU} to ${recommendedCPU}.`
        }
      } else if (utilization > this.utilizationThresholds.cpu_underprovisioned) {
        // Under-provisioned - should increase
        const recommendedCPU = this.calculateRightSizedCPU(currentCPU, utilization)

        recommendation = {
          type: 'scale_up_cpu',
          severity: 'high',
          current_value: currentCPU,
          recommended_value: recommendedCPU,
          utilization: Math.round(utilization * 100),
          impact: 'medium',
          estimated_cost_increase_percent: Math.round(((recommendedCPU - currentCPU) / currentCPU) * 100),
          message: `CPU under-provisioned (${Math.round(utilization * 100)}% utilization). Increase from ${currentCPU} to ${recommendedCPU}.`
        }
      }

      return {
        utilization: Math.round(utilization * 100),
        recommendation
      }
    } catch (error) {
      console.error('[ResourceAnalyzer] Error analyzing CPU:', error.message)
      return { utilization: null, recommendation: null }
    }
  }

  /**
   * Analyze memory utilization
   */
  async analyzeMemory(deployment) {
    try {
      const query = `
        sum(container_memory_working_set_bytes{
          namespace="${deployment.namespace}",
          pod=~"${deployment.name}.*"
        }) /
        sum(kube_pod_container_resource_requests{
          namespace="${deployment.namespace}",
          pod=~"${deployment.name}.*",
          resource="memory"
        })
      `

      const utilization = await this.queryPrometheus(query)

      if (utilization === null) {
        return { utilization: null, recommendation: null }
      }

      const currentMemory = await this.getCurrentMemoryRequest(deployment)
      let recommendation = null

      if (utilization < this.utilizationThresholds.memory_overprovisioned) {
        const recommendedMemory = this.calculateRightSizedMemory(currentMemory, utilization)

        recommendation = {
          type: 'scale_down_memory',
          severity: 'medium',
          current_value: currentMemory,
          recommended_value: recommendedMemory,
          utilization: Math.round(utilization * 100),
          impact: 'low',
          estimated_savings_percent: Math.round(((currentMemory - recommendedMemory) / currentMemory) * 100),
          message: `Memory over-provisioned (${Math.round(utilization * 100)}% utilization). Reduce from ${currentMemory} to ${recommendedMemory}.`
        }
      } else if (utilization > this.utilizationThresholds.memory_underprovisioned) {
        const recommendedMemory = this.calculateRightSizedMemory(currentMemory, utilization)

        recommendation = {
          type: 'scale_up_memory',
          severity: 'high',
          current_value: currentMemory,
          recommended_value: recommendedMemory,
          utilization: Math.round(utilization * 100),
          impact: 'medium',
          estimated_cost_increase_percent: Math.round(((recommendedMemory - currentMemory) / currentMemory) * 100),
          message: `Memory under-provisioned (${Math.round(utilization * 100)}% utilization). Increase from ${currentMemory} to ${recommendedMemory}.`
        }
      }

      return {
        utilization: Math.round(utilization * 100),
        recommendation
      }
    } catch (error) {
      console.error('[ResourceAnalyzer] Error analyzing memory:', error.message)
      return { utilization: null, recommendation: null }
    }
  }

  /**
   * Analyze replica count
   */
  async analyzeReplicas(deployment) {
    try {
      // Check traffic patterns over last 24h
      const query = `
        avg(rate(container_network_receive_bytes_total{
          namespace="${deployment.namespace}",
          pod=~"${deployment.name}.*"
        }[${this.analysisWindow}]))
      `

      const avgTraffic = await this.queryPrometheus(query)

      if (avgTraffic === null || avgTraffic === 0) {
        // No traffic - candidate for scale to zero
        if (deployment.replicas > 0) {
          return {
            utilization: 0,
            recommendation: {
              type: 'scale_to_zero',
              severity: 'low',
              current_value: deployment.replicas,
              recommended_value: 0,
              utilization: 0,
              impact: 'medium',
              estimated_savings_percent: 100,
              message: `No traffic detected in ${this.analysisWindow}. Consider scaling to zero or removing.`
            }
          }
        }
      }

      // Could add more sophisticated replica analysis based on request rate

      return {
        utilization: null,
        recommendation: null
      }
    } catch (error) {
      console.error('[ResourceAnalyzer] Error analyzing replicas:', error.message)
      return { utilization: null, recommendation: null }
    }
  }

  /**
   * Query Prometheus
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
      console.error('[ResourceAnalyzer] Prometheus query error:', error.message)
      return null
    }
  }

  /**
   * Get current CPU request
   */
  async getCurrentCPURequest(deployment) {
    // Parse from deployment.containers[0].resources.requests.cpu
    const container = deployment.containers[0]
    if (!container || !container.resources || !container.resources.requests) {
      return '100m'
    }

    return container.resources.requests.cpu || '100m'
  }

  /**
   * Get current memory request
   */
  async getCurrentMemoryRequest(deployment) {
    const container = deployment.containers[0]
    if (!container || !container.resources || !container.resources.requests) {
      return '128Mi'
    }

    return container.resources.requests.memory || '128Mi'
  }

  /**
   * Calculate right-sized CPU
   */
  calculateRightSizedCPU(current, utilization) {
    // Parse CPU value (e.g., "500m" or "1")
    const currentMillis = this.parseCPU(current)

    // Target 60% utilization
    const targetUtilization = 0.6
    const recommendedMillis = Math.round((currentMillis * utilization) / targetUtilization)

    // Round to nearest 100m
    const rounded = Math.max(100, Math.round(recommendedMillis / 100) * 100)

    return rounded >= 1000 ? `${(rounded / 1000).toFixed(1)}` : `${rounded}m`
  }

  /**
   * Calculate right-sized memory
   */
  calculateRightSizedMemory(current, utilization) {
    // Parse memory value (e.g., "512Mi" or "1Gi")
    const currentMi = this.parseMemory(current)

    // Target 60% utilization
    const targetUtilization = 0.6
    const recommendedMi = Math.round((currentMi * utilization) / targetUtilization)

    // Round to nearest 128Mi
    const rounded = Math.max(128, Math.round(recommendedMi / 128) * 128)

    return rounded >= 1024 ? `${(rounded / 1024).toFixed(1)}Gi` : `${rounded}Mi`
  }

  /**
   * Parse CPU string to millicores
   */
  parseCPU(cpu) {
    if (cpu.endsWith('m')) {
      return parseInt(cpu)
    }

    return parseFloat(cpu) * 1000
  }

  /**
   * Parse memory string to Mi
   */
  parseMemory(memory) {
    if (memory.endsWith('Mi')) {
      return parseInt(memory)
    } else if (memory.endsWith('Gi')) {
      return parseFloat(memory) * 1024
    } else if (memory.endsWith('Ki')) {
      return parseInt(memory) / 1024
    }

    return parseInt(memory) / (1024 * 1024)
  }

  /**
   * Calculate potential savings
   */
  calculatePotentialSavings(recommendations) {
    let totalSavings = 0
    let savingsCount = 0

    for (const deployment of recommendations) {
      for (const rec of deployment.recommendations) {
        if (rec.estimated_savings_percent) {
          totalSavings += rec.estimated_savings_percent
          savingsCount++
        }
      }
    }

    const avgSavings = savingsCount > 0 ? totalSavings / savingsCount : 0

    return {
      average_savings_percent: Math.round(avgSavings),
      recommendations_with_savings: savingsCount,
      potential_cost_reduction: 'Estimated 10-30% cost reduction in cloud environments'
    }
  }
}

export default ResourceAnalyzer
