import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Task Decomposer
 *
 * Breaks down high-level infrastructure intents into executable Cortex tasks
 * Creates dependency graphs and execution plans
 */

class TaskDecomposer {
  constructor() {
    this.taskTemplates = this.loadTaskTemplates()
  }

  /**
   * Load task templates for different intents
   */
  loadTaskTemplates() {
    return {
      provision_k8s_cluster: {
        steps: [
          {
            name: 'Provision VMs',
            contractor: 'proxmox-contractor',
            task_type: 'vm_provisioning',
            dependencies: [],
            estimated_duration: '10-15 minutes',
            params: {
              vm_count: '${requirements.replicas || 3}',
              cpu_cores: '${requirements.cpu || 4}',
              memory_gb: '${requirements.memory_gb || 8}',
              disk_gb: '${requirements.storage_gb || 100}'
            }
          },
          {
            name: 'Bootstrap Talos Linux',
            contractor: 'talos-contractor',
            task_type: 'talos_bootstrap',
            dependencies: ['Provision VMs'],
            estimated_duration: '10-15 minutes',
            params: {
              cluster_name: '${requirements.cluster_name || "cortex-k3s"}',
              kubernetes_version: '${requirements.k8s_version || "latest"}'
            }
          },
          {
            name: 'Deploy Monitoring Stack',
            contractor: 'monitoring-contractor',
            task_type: 'monitoring_deployment',
            dependencies: ['Bootstrap Talos Linux'],
            estimated_duration: '10-15 minutes',
            params: {
              components: ['prometheus', 'grafana']
            }
          },
          {
            name: 'Verify Cluster Health',
            contractor: 'verification-contractor',
            task_type: 'health_check',
            dependencies: ['Deploy Monitoring Stack'],
            estimated_duration: '2-5 minutes',
            params: {
              checks: ['api_server', 'nodes_ready', 'system_pods']
            }
          }
        ]
      },

      deploy_monitoring_stack: {
        steps: [
          {
            name: 'Deploy Prometheus',
            contractor: 'monitoring-contractor',
            task_type: 'prometheus_deployment',
            dependencies: [],
            estimated_duration: '5-10 minutes',
            params: {
              namespace: 'monitoring',
              retention: '${requirements.retention_days || 15}d',
              storage: '${requirements.storage_gb || 50}Gi'
            }
          },
          {
            name: 'Deploy Grafana',
            contractor: 'monitoring-contractor',
            task_type: 'grafana_deployment',
            dependencies: ['Deploy Prometheus'],
            estimated_duration: '5-10 minutes',
            params: {
              namespace: 'monitoring',
              datasources: ['prometheus']
            }
          },
          {
            name: 'Configure Dashboards',
            contractor: 'monitoring-contractor',
            task_type: 'dashboard_configuration',
            dependencies: ['Deploy Grafana'],
            estimated_duration: '2-5 minutes',
            params: {
              dashboards: ['cluster_overview', 'pod_metrics', 'node_metrics']
            }
          },
          {
            name: 'Setup Alert Rules',
            contractor: 'monitoring-contractor',
            task_type: 'alert_configuration',
            dependencies: ['Deploy Prometheus'],
            estimated_duration: '2-5 minutes',
            params: {
              alert_groups: ['critical', 'warning']
            }
          }
        ]
      },

      deploy_application: {
        steps: [
          {
            name: 'Build Container Image',
            contractor: 'container-builder',
            task_type: 'image_build',
            dependencies: [],
            estimated_duration: '5-10 minutes',
            params: {
              dockerfile: '${requirements.dockerfile || "Dockerfile"}',
              context: '${requirements.build_context || "."}',
              tags: ['latest', '${requirements.version || "v1.0.0"}']
            }
          },
          {
            name: 'Push to Registry',
            contractor: 'container-builder',
            task_type: 'image_push',
            dependencies: ['Build Container Image'],
            estimated_duration: '2-5 minutes',
            params: {
              registry: '${requirements.registry || "docker.io"}'
            }
          },
          {
            name: 'Deploy to Kubernetes',
            contractor: 'k8s-deployment',
            task_type: 'deployment',
            dependencies: ['Push to Registry'],
            estimated_duration: '3-5 minutes',
            params: {
              namespace: '${requirements.namespace || "default"}',
              replicas: '${requirements.replicas || 3}',
              image: '${output.Push to Registry.image_name}'
            }
          },
          {
            name: 'Create Service',
            contractor: 'k8s-deployment',
            task_type: 'service',
            dependencies: ['Deploy to Kubernetes'],
            estimated_duration: '1-2 minutes',
            params: {
              type: '${requirements.service_type || "ClusterIP"}',
              port: '${requirements.port || 80}'
            }
          }
        ]
      },

      provision_database: {
        steps: [
          {
            name: 'Deploy Database',
            contractor: 'database-contractor',
            task_type: 'database_deployment',
            dependencies: [],
            estimated_duration: '10-15 minutes',
            params: {
              db_type: '${requirements.db_type || "postgres"}',
              version: '${requirements.version || "14"}',
              storage: '${requirements.storage_gb || 100}Gi',
              replicas: '${requirements.replicas || 1}'
            }
          },
          {
            name: 'Configure Backup',
            contractor: 'backup-contractor',
            task_type: 'backup_configuration',
            dependencies: ['Deploy Database'],
            estimated_duration: '5-10 minutes',
            params: {
              schedule: '${requirements.backup_schedule || "0 2 * * *"}',
              retention_days: '${requirements.retention_days || 30}',
              storage_type: 's3'
            }
          },
          {
            name: 'Setup Monitoring',
            contractor: 'monitoring-contractor',
            task_type: 'database_monitoring',
            dependencies: ['Deploy Database'],
            estimated_duration: '3-5 minutes',
            params: {
              metrics: ['connections', 'query_time', 'replication_lag']
            }
          }
        ]
      },

      scale_infrastructure: {
        steps: [
          {
            name: 'Update Deployment Scale',
            contractor: 'autoscaler',
            task_type: 'scale_deployment',
            dependencies: [],
            estimated_duration: '2-5 minutes',
            params: {
              deployment: '${requirements.deployment_name}',
              replicas: '${requirements.target_replicas}',
              namespace: '${requirements.namespace || "default"}'
            }
          },
          {
            name: 'Verify Scaling',
            contractor: 'verification-contractor',
            task_type: 'scaling_verification',
            dependencies: ['Update Deployment Scale'],
            estimated_duration: '2-5 minutes',
            params: {
              expected_replicas: '${requirements.target_replicas}'
            }
          }
        ]
      },

      security_hardening: {
        steps: [
          {
            name: 'Implement RBAC',
            contractor: 'security-contractor',
            task_type: 'rbac_configuration',
            dependencies: [],
            estimated_duration: '10-15 minutes',
            params: {
              roles: ['admin', 'developer', 'viewer']
            }
          },
          {
            name: 'Configure Network Policies',
            contractor: 'security-contractor',
            task_type: 'network_policy',
            dependencies: [],
            estimated_duration: '10-15 minutes',
            params: {
              default_deny: true,
              allowed_namespaces: ['kube-system', 'monitoring']
            }
          },
          {
            name: 'Enable Pod Security',
            contractor: 'security-contractor',
            task_type: 'pod_security_standards',
            dependencies: [],
            estimated_duration: '5-10 minutes',
            params: {
              level: 'restricted'
            }
          },
          {
            name: 'Run Security Scan',
            contractor: 'security-contractor',
            task_type: 'vulnerability_scan',
            dependencies: ['Implement RBAC', 'Configure Network Policies', 'Enable Pod Security'],
            estimated_duration: '10-15 minutes',
            params: {
              scan_type: 'comprehensive'
            }
          }
        ]
      },

      setup_cicd_pipeline: {
        steps: [
          {
            name: 'Configure GitHub Actions',
            contractor: 'cicd-contractor',
            task_type: 'github_actions_setup',
            dependencies: [],
            estimated_duration: '10-15 minutes',
            params: {
              workflows: ['build', 'test', 'deploy']
            }
          },
          {
            name: 'Setup ArgoCD',
            contractor: 'cicd-contractor',
            task_type: 'argocd_deployment',
            dependencies: ['Configure GitHub Actions'],
            estimated_duration: '10-15 minutes',
            params: {
              namespace: 'argocd',
              repo_url: '${requirements.repo_url}'
            }
          },
          {
            name: 'Create Application Manifests',
            contractor: 'cicd-contractor',
            task_type: 'manifest_generation',
            dependencies: ['Setup ArgoCD'],
            estimated_duration: '5-10 minutes',
            params: {
              app_name: '${requirements.app_name}',
              sync_policy: 'automated'
            }
          }
        ]
      }
    }
  }

  /**
   * Decompose parsed intent into executable tasks
   */
  async decomposeIntoTasks(parsedIntent) {
    console.log(`[TaskDecomposer] Decomposing intent: ${parsedIntent.primary_goal}`)

    const template = this.taskTemplates[parsedIntent.primary_goal]

    if (!template) {
      throw new Error(`No task template found for intent: ${parsedIntent.primary_goal}`)
    }

    // Generate tasks from template
    const tasks = []
    const taskIdMap = {}

    for (const step of template.steps) {
      const task = await this.createTask(step, parsedIntent, taskIdMap)
      tasks.push(task)
      taskIdMap[step.name] = task.task_id
    }

    // Build dependency graph
    const dependencyGraph = this.buildDependencyGraph(tasks)

    // Calculate execution plan
    const executionPlan = this.calculateExecutionPlan(tasks, dependencyGraph)

    const decomposition = {
      intent: parsedIntent.primary_goal,
      description: parsedIntent.description,
      tasks,
      dependency_graph: dependencyGraph,
      execution_plan: executionPlan,
      estimated_total_time: this.calculateTotalTime(executionPlan),
      estimated_cost: parsedIntent.estimated_cost,
      created_at: new Date().toISOString()
    }

    console.log(`[TaskDecomposer] Created ${tasks.length} tasks with ${executionPlan.phases.length} execution phases`)

    return decomposition
  }

  /**
   * Create individual task from step template
   */
  async createTask(step, parsedIntent, taskIdMap) {
    const taskId = `task-${uuidv4()}`

    // Resolve parameters with intent requirements
    const params = this.resolveParams(step.params, parsedIntent)

    // Map dependencies to task IDs
    const dependencies = step.dependencies.map(depName => taskIdMap[depName]).filter(id => id)

    return {
      task_id: taskId,
      name: step.name,
      contractor: step.contractor,
      task_type: step.task_type,
      status: 'pending',
      dependencies,
      params,
      estimated_duration: step.estimated_duration,
      created_at: new Date().toISOString()
    }
  }

  /**
   * Resolve parameter placeholders with actual values
   */
  resolveParams(params, parsedIntent) {
    const resolved = {}

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.includes('${')) {
        // Extract placeholder
        const match = value.match(/\$\{([^}]+)\}/)

        if (match) {
          const expression = match[1]

          // Evaluate expression (simple eval for requirements)
          try {
            const requirements = parsedIntent.requirements
            resolved[key] = eval(expression)
          } catch (error) {
            console.warn(`[TaskDecomposer] Could not resolve ${expression}, using default`)
            resolved[key] = value
          }
        } else {
          resolved[key] = value
        }
      } else {
        resolved[key] = value
      }
    }

    return resolved
  }

  /**
   * Build dependency graph
   */
  buildDependencyGraph(tasks) {
    const graph = {}

    for (const task of tasks) {
      graph[task.task_id] = {
        name: task.name,
        dependencies: task.dependencies,
        dependents: []
      }
    }

    // Add reverse edges (dependents)
    for (const task of tasks) {
      for (const depId of task.dependencies) {
        if (graph[depId]) {
          graph[depId].dependents.push(task.task_id)
        }
      }
    }

    return graph
  }

  /**
   * Calculate execution plan with phases
   */
  calculateExecutionPlan(tasks, dependencyGraph) {
    const phases = []
    const completed = new Set()
    const taskMap = {}

    for (const task of tasks) {
      taskMap[task.task_id] = task
    }

    // Topological sort into phases
    while (completed.size < tasks.length) {
      const phase = []

      for (const task of tasks) {
        if (completed.has(task.task_id)) continue

        // Check if all dependencies are completed
        const allDepsSatisfied = task.dependencies.every(depId => completed.has(depId))

        if (allDepsSatisfied) {
          phase.push({
            task_id: task.task_id,
            name: task.name,
            contractor: task.contractor,
            estimated_duration: task.estimated_duration
          })
        }
      }

      if (phase.length === 0) {
        throw new Error('Circular dependency detected in task graph')
      }

      phases.push({
        phase_number: phases.length + 1,
        tasks: phase,
        parallel_execution: phase.length > 1
      })

      // Mark phase tasks as completed
      for (const task of phase) {
        completed.add(task.task_id)
      }
    }

    return {
      phases,
      total_phases: phases.length,
      parallel_phases: phases.filter(p => p.parallel_execution).length
    }
  }

  /**
   * Calculate total estimated time
   */
  calculateTotalTime(executionPlan) {
    let totalMinutes = 0

    for (const phase of executionPlan.phases) {
      // For parallel phases, take the max duration
      let phaseMinutes = 0

      for (const task of phase.tasks) {
        const duration = this.parseDuration(task.estimated_duration)
        phaseMinutes = Math.max(phaseMinutes, duration)
      }

      totalMinutes += phaseMinutes
    }

    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    return {
      total_minutes: totalMinutes,
      formatted: hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
    }
  }

  /**
   * Parse duration string to minutes
   */
  parseDuration(duration) {
    const match = duration.match(/(\d+)-(\d+)\s*minutes?/)

    if (match) {
      // Use average of range
      return (parseInt(match[1]) + parseInt(match[2])) / 2
    }

    return 10 // Default
  }

  /**
   * Save decomposition to disk
   */
  async saveDecomposition(decomposition) {
    const decompositionPath = path.join(
      __dirname,
      '../../coordination/task-decompositions',
      `${decomposition.intent}-${Date.now()}.json`
    )

    const dir = path.dirname(decompositionPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(decompositionPath, JSON.stringify(decomposition, null, 2))

    console.log(`[TaskDecomposer] Saved decomposition to ${decompositionPath}`)

    return decompositionPath
  }
}

export default TaskDecomposer
