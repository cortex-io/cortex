/**
 * Coordinator Agent Usage Examples
 */

import { CoordinatorAgent, Task, ProjectRequest } from '../src/index';

// Initialize coordinator
const coordinator = new CoordinatorAgent();

// Example 1: Route a simple VM provisioning task
async function example1_SimpleTask() {
  console.log('\n=== Example 1: Simple VM Provisioning ===\n');

  const task: Task = {
    task_id: 'task-vm-001',
    task_name: 'Provision staging VM',
    description: 'Create VM for staging environment with 4 CPU, 8GB RAM',
    domain: 'vm_provisioning',
    priority: 'p2_medium',
    created_at: new Date().toISOString(),
    requester: 'dev-team',
    metadata: {
      requirements: ['4 CPU cores', '8GB RAM', '100GB disk'],
      acceptance_criteria: ['VM created', 'Network configured', 'Accessible via SSH'],
    },
  };

  const decision = await coordinator.routeTask(task);
  console.log('Decision:', JSON.stringify(decision, null, 2));
}

// Example 2: Route a complex Kubernetes cluster task
async function example2_ComplexTask() {
  console.log('\n=== Example 2: Complex Kubernetes Cluster ===\n');

  const task: Task = {
    task_id: 'task-k8s-001',
    task_name: 'Bootstrap production K8s cluster',
    description: 'Create HA Kubernetes cluster with 3 control planes and 5 workers',
    domain: 'kubernetes_cluster',
    priority: 'p1_high',
    created_at: new Date().toISOString(),
    deadline: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours
    requester: 'ops-team',
    metadata: {
      requirements: [
        '3 control plane nodes',
        '5 worker nodes',
        'HA etcd',
        'Load balancer',
        'Storage CSI',
      ],
      acceptance_criteria: [
        'All nodes in Ready state',
        'CoreDNS operational',
        'Storage classes available',
        'Load balancer configured',
      ],
      impact: 9,
      urgency: 8,
      business_value: 9,
      risk: 8,
    },
  };

  const decision = await coordinator.routeTask(task);
  console.log('Decision:', JSON.stringify(decision, null, 2));
}

// Example 3: Spawn PM for complex project
async function example3_SpawnPM() {
  console.log('\n=== Example 3: Spawn PM for Complex Project ===\n');

  const project: ProjectRequest = {
    objective: 'Deploy complete monitoring stack across all environments',
    priority: 'p1_high',
    requirements: [
      'Provision monitoring VMs in 3 datacenters',
      'Deploy Kubernetes monitoring stack',
      'Configure Prometheus federation',
      'Setup Grafana dashboards',
      'Create n8n alert workflows',
      'Integrate with PagerDuty',
    ],
    constraints: {
      budget_tokens: 150000,
      deadline_days: 5,
    },
    success_criteria: [
      'Monitoring operational in all datacenters',
      'Alerting working end-to-end',
      'Dashboards accessible',
      'PagerDuty integration verified',
      '<1 minute alert latency',
    ],
    estimated_complexity: 8.2,
    requester: 'sre-team',
  };

  const pmRequest = await coordinator.spawnPM(project);
  console.log('PM Request:', JSON.stringify(pmRequest, null, 2));
}

// Example 4: Check coordinator status
async function example4_Status() {
  console.log('\n=== Example 4: Coordinator Status ===\n');

  const state = coordinator.getState();
  const queueStats = coordinator.getQueueStats();
  const loadMetrics = coordinator.getLoadMetrics();

  console.log('Active Tasks:', state.active_tasks.size);
  console.log('Queue Depth:', queueStats.total_depth);
  console.log('Avg Utilization:', `${(loadMetrics.avg_utilization * 100).toFixed(1)}%`);
  console.log('Available Contractors:', loadMetrics.available_contractors.length);
}

// Example 5: Process queue
async function example5_ProcessQueue() {
  console.log('\n=== Example 5: Process Queue ===\n');

  coordinator.checkStarvation();
  const assigned = await coordinator.processQueue();

  console.log(`Assigned ${assigned} queued tasks`);
}

// Run all examples
async function runExamples() {
  console.log('Cortex Coordinator Agent - Usage Examples');
  console.log('==========================================');

  await example1_SimpleTask();
  await example2_ComplexTask();
  await example3_SpawnPM();
  await example4_Status();
  await example5_ProcessQueue();

  console.log('\n=== All Examples Complete ===\n');
}

// Run if executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}

export {
  example1_SimpleTask,
  example2_ComplexTask,
  example3_SpawnPM,
  example4_Status,
  example5_ProcessQueue,
};
