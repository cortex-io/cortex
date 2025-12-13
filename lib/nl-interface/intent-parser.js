import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Intent Parser for Natural Language Infrastructure Requests
 *
 * Parses high-level user requests into structured infrastructure tasks
 * Identifies components, requirements, constraints, and success criteria
 */

class IntentParser {
  constructor() {
    this.intentTemplates = this.loadIntentTemplates()
    this.componentMapping = this.loadComponentMapping()
  }

  /**
   * Load intent templates for common patterns
   */
  loadIntentTemplates() {
    return {
      // Infrastructure provisioning
      provision_cluster: {
        patterns: [
          /(?:build|create|provision|deploy|setup).*(?:kubernetes|k8s|cluster)/i,
          /(?:spin up|bring up).*(?:cluster|k8s)/i
        ],
        intent: 'provision_k8s_cluster',
        components: ['proxmox-contractor', 'talos-contractor', 'monitoring-contractor'],
        estimated_time: '30-60 minutes'
      },

      // Monitoring stack
      monitoring_stack: {
        patterns: [
          /(?:build|create|deploy|setup).*(?:monitoring|observability).*stack/i,
          /(?:prometheus|grafana).*(?:stack|deployment)/i,
          /set up.*(?:metrics|monitoring)/i
        ],
        intent: 'deploy_monitoring_stack',
        components: ['monitoring-contractor', 'k8s-deployment'],
        estimated_time: '15-30 minutes'
      },

      // Application deployment
      app_deployment: {
        patterns: [
          /deploy.*(?:application|app|service)/i,
          /(?:containerize|dockerize).*(?:and deploy|to k8s)/i
        ],
        intent: 'deploy_application',
        components: ['container-builder', 'k8s-deployment'],
        estimated_time: '10-20 minutes'
      },

      // Database setup
      database_setup: {
        patterns: [
          /(?:create|setup|provision|deploy).*(?:database|postgres|mysql|mongodb)/i,
          /(?:database|db).*(?:cluster|deployment)/i
        ],
        intent: 'provision_database',
        components: ['database-contractor', 'k8s-deployment', 'backup-contractor'],
        estimated_time: '15-25 minutes'
      },

      // Scaling operations
      scaling: {
        patterns: [
          /scale.*(?:up|down|out|in)/i,
          /(?:increase|decrease).*(?:capacity|replicas)/i,
          /(?:horizontal|vertical).*scaling/i
        ],
        intent: 'scale_infrastructure',
        components: ['autoscaler', 'k8s-deployment'],
        estimated_time: '5-10 minutes'
      },

      // Backup and recovery
      backup: {
        patterns: [
          /(?:create|setup|configure).*backup/i,
          /disaster.*recovery/i,
          /backup.*(?:strategy|solution)/i
        ],
        intent: 'configure_backups',
        components: ['backup-contractor', 'storage-manager'],
        estimated_time: '10-15 minutes'
      },

      // Security hardening
      security: {
        patterns: [
          /(?:harden|secure|lock down).*(?:cluster|infrastructure)/i,
          /(?:security|vulnerability).*(?:scan|audit)/i,
          /(?:implement|setup).*(?:rbac|network policies)/i
        ],
        intent: 'security_hardening',
        components: ['security-contractor', 'compliance-scanner'],
        estimated_time: '20-40 minutes'
      },

      // CI/CD pipeline
      cicd: {
        patterns: [
          /(?:create|setup|build).*(?:ci\/cd|pipeline)/i,
          /(?:github actions|jenkins|gitlab).*pipeline/i,
          /automate.*(?:deployment|testing)/i
        ],
        intent: 'setup_cicd_pipeline',
        components: ['cicd-contractor', 'github-integration'],
        estimated_time: '20-30 minutes'
      }
    }
  }

  /**
   * Load component mapping for infrastructure
   */
  loadComponentMapping() {
    return {
      'proxmox-contractor': {
        description: 'Provisions VMs on Proxmox',
        capabilities: ['vm_creation', 'resource_allocation', 'networking'],
        dependencies: []
      },
      'talos-contractor': {
        description: 'Bootstraps Talos Linux and K3s',
        capabilities: ['k8s_bootstrap', 'node_configuration', 'cluster_init'],
        dependencies: ['proxmox-contractor']
      },
      'monitoring-contractor': {
        description: 'Deploys monitoring stack (Prometheus, Grafana)',
        capabilities: ['metrics', 'dashboards', 'alerting'],
        dependencies: ['k8s-deployment']
      },
      'k8s-deployment': {
        description: 'Deploys resources to Kubernetes',
        capabilities: ['deployment', 'service', 'ingress', 'configmap'],
        dependencies: []
      },
      'container-builder': {
        description: 'Builds and pushes container images',
        capabilities: ['docker_build', 'image_push', 'multi_stage'],
        dependencies: []
      },
      'database-contractor': {
        description: 'Provisions and configures databases',
        capabilities: ['postgres', 'mysql', 'mongodb', 'replication'],
        dependencies: ['k8s-deployment']
      },
      'autoscaler': {
        description: 'Manages horizontal and vertical pod autoscaling',
        capabilities: ['hpa', 'vpa', 'cluster_autoscaler'],
        dependencies: ['k8s-deployment']
      },
      'backup-contractor': {
        description: 'Configures backup and disaster recovery',
        capabilities: ['velero', 's3_backup', 'restore'],
        dependencies: ['k8s-deployment']
      },
      'security-contractor': {
        description: 'Implements security controls',
        capabilities: ['rbac', 'network_policies', 'pod_security', 'scanning'],
        dependencies: []
      },
      'cicd-contractor': {
        description: 'Sets up CI/CD pipelines',
        capabilities: ['github_actions', 'argocd', 'tekton'],
        dependencies: ['k8s-deployment']
      }
    }
  }

  /**
   * Parse natural language request into structured intent
   */
  async parseIntent(userRequest) {
    console.log(`[IntentParser] Parsing request: "${userRequest}"`)

    // Match request against intent templates
    const matchedIntent = this.matchIntent(userRequest)

    if (!matchedIntent) {
      return {
        success: false,
        error: 'Could not understand request',
        suggestion: 'Try describing your infrastructure need more specifically'
      }
    }

    // Extract components, requirements, and constraints
    const components = this.extractComponents(userRequest, matchedIntent)
    const requirements = this.extractRequirements(userRequest)
    const constraints = this.extractConstraints(userRequest)
    const successCriteria = this.extractSuccessCriteria(userRequest)

    const parsed = {
      success: true,
      primary_goal: matchedIntent.intent,
      description: userRequest,
      components,
      requirements,
      constraints,
      success_criteria: successCriteria,
      estimated_time: matchedIntent.estimated_time,
      estimated_cost: this.estimateCost(components, requirements)
    }

    console.log('[IntentParser] Parsed intent:', parsed.primary_goal)

    return parsed
  }

  /**
   * Match user request to intent template
   */
  matchIntent(userRequest) {
    for (const [name, template] of Object.entries(this.intentTemplates)) {
      for (const pattern of template.patterns) {
        if (pattern.test(userRequest)) {
          return template
        }
      }
    }

    return null
  }

  /**
   * Extract components needed for request
   */
  extractComponents(userRequest, matchedIntent) {
    const components = [...matchedIntent.components]

    // Add additional components based on keywords
    const keywords = {
      'prometheus': 'monitoring-contractor',
      'grafana': 'monitoring-contractor',
      'postgres': 'database-contractor',
      'mysql': 'database-contractor',
      'backup': 'backup-contractor',
      'security': 'security-contractor',
      'ci/cd': 'cicd-contractor',
      'autoscal': 'autoscaler'
    }

    for (const [keyword, component] of Object.entries(keywords)) {
      if (userRequest.toLowerCase().includes(keyword) && !components.includes(component)) {
        components.push(component)
      }
    }

    return components.map(comp => ({
      component: comp,
      ...this.componentMapping[comp]
    }))
  }

  /**
   * Extract configuration requirements
   */
  extractRequirements(userRequest) {
    const requirements = {}

    // Extract replica count
    const replicaMatch = userRequest.match(/(\d+)\s*(?:replica|instance|node)/i)
    if (replicaMatch) {
      requirements.replicas = parseInt(replicaMatch[1])
    }

    // Extract resource requirements
    const cpuMatch = userRequest.match(/(\d+)\s*(?:cpu|core|vcpu)/i)
    if (cpuMatch) {
      requirements.cpu = parseInt(cpuMatch[1])
    }

    const memoryMatch = userRequest.match(/(\d+)\s*(?:gb|gib).*(?:memory|ram)/i)
    if (memoryMatch) {
      requirements.memory_gb = parseInt(memoryMatch[1])
    }

    const storageMatch = userRequest.match(/(\d+)\s*(?:gb|gib|tb|tib).*(?:storage|disk)/i)
    if (storageMatch) {
      requirements.storage_gb = parseInt(storageMatch[1])
    }

    // Extract region/location
    const regionMatch = userRequest.match(/(?:in|region|location)\s+([a-z0-9-]+)/i)
    if (regionMatch) {
      requirements.region = regionMatch[1]
    }

    // Extract environment
    if (/production|prod/i.test(userRequest)) {
      requirements.environment = 'production'
    } else if (/staging|stage/i.test(userRequest)) {
      requirements.environment = 'staging'
    } else if (/dev|development/i.test(userRequest)) {
      requirements.environment = 'development'
    }

    return requirements
  }

  /**
   * Extract constraints (budget, timeline, etc.)
   */
  extractConstraints(userRequest) {
    const constraints = {}

    // Extract budget constraint
    const budgetMatch = userRequest.match(/(?:budget|cost).*\$(\d+)/i)
    if (budgetMatch) {
      constraints.budget_usd = parseInt(budgetMatch[1])
    }

    // Extract timeline constraint
    const timelinePatterns = [
      { pattern: /(?:within|in)\s*(\d+)\s*hour/i, unit: 'hours' },
      { pattern: /(?:within|in)\s*(\d+)\s*day/i, unit: 'days' },
      { pattern: /(?:within|in)\s*(\d+)\s*week/i, unit: 'weeks' }
    ]

    for (const { pattern, unit } of timelinePatterns) {
      const match = userRequest.match(pattern)
      if (match) {
        constraints.timeline = {
          value: parseInt(match[1]),
          unit
        }
        break
      }
    }

    // Extract high availability requirement
    if (/(?:high availability|ha|highly available)/i.test(userRequest)) {
      constraints.high_availability = true
    }

    // Extract disaster recovery requirement
    if (/(?:disaster recovery|dr|backup)/i.test(userRequest)) {
      constraints.disaster_recovery = true
    }

    return constraints
  }

  /**
   * Extract success criteria
   */
  extractSuccessCriteria(userRequest) {
    const criteria = []

    if (/running|operational|up/i.test(userRequest)) {
      criteria.push('All components are running and healthy')
    }

    if (/accessible|reachable/i.test(userRequest)) {
      criteria.push('Services are accessible via ingress/loadbalancer')
    }

    if (/monitor/i.test(userRequest)) {
      criteria.push('Monitoring and alerting configured')
    }

    if (/secure/i.test(userRequest)) {
      criteria.push('Security controls implemented and verified')
    }

    if (/backup/i.test(userRequest)) {
      criteria.push('Backup strategy configured and tested')
    }

    if (criteria.length === 0) {
      criteria.push('Deployment completed successfully')
      criteria.push('All health checks passing')
    }

    return criteria
  }

  /**
   * Estimate cost for infrastructure request
   */
  estimateCost(components, requirements) {
    // Simple cost estimation model
    let baseCost = 0

    // Per-component cost
    const componentCosts = {
      'proxmox-contractor': 0,  // Using existing Proxmox
      'talos-contractor': 0,    // Free software
      'monitoring-contractor': 0, // Free software
      'k8s-deployment': 0,      // Free
      'container-builder': 0,   // Free
      'database-contractor': 0, // Free software
      'autoscaler': 0,          // Free
      'backup-contractor': 5,   // S3 storage costs
      'security-contractor': 0, // Free tools
      'cicd-contractor': 0      // Free (GitHub Actions included)
    }

    for (const component of components) {
      baseCost += componentCosts[component.component] || 0
    }

    // Resource-based cost (homelab = free, cloud would have actual costs)
    const resourceCost = 0  // Homelab deployment

    return {
      estimated_usd_per_month: baseCost + resourceCost,
      breakdown: {
        components: baseCost,
        resources: resourceCost,
        storage: 5
      },
      notes: 'Homelab deployment - minimal costs. Cloud deployment would be higher.'
    }
  }

  /**
   * Get example requests
   */
  getExamples() {
    return [
      {
        request: 'Build me a Kubernetes cluster with 3 nodes',
        intent: 'provision_k8s_cluster'
      },
      {
        request: 'Deploy a monitoring stack with Prometheus and Grafana',
        intent: 'deploy_monitoring_stack'
      },
      {
        request: 'Set up a PostgreSQL database with 100GB storage and backups',
        intent: 'provision_database'
      },
      {
        request: 'Create a CI/CD pipeline for my application',
        intent: 'setup_cicd_pipeline'
      },
      {
        request: 'Scale my deployment to 5 replicas',
        intent: 'scale_infrastructure'
      },
      {
        request: 'Harden my cluster security with RBAC and network policies',
        intent: 'security_hardening'
      }
    ]
  }
}

export default IntentParser
