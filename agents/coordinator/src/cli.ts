#!/usr/bin/env node
/**
 * Coordinator CLI
 * Command-line interface for the Coordinator Agent
 */

import { CoordinatorAgent } from './coordinator';
import { Task, Priority, TaskDomain, ProjectRequest } from '../types';

const coordinator = new CoordinatorAgent();

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case 'route':
      await handleRoute(args);
      break;
    case 'spawn-pm':
      await handleSpawnPM(args);
      break;
    case 'status':
      await handleStatus();
      break;
    case 'process-queue':
      await handleProcessQueue();
      break;
    case 'metrics':
      await handleMetrics();
      break;
    default:
      printUsage();
      process.exit(1);
  }
}

async function handleRoute(args: string[]) {
  if (args.length < 3) {
    console.error('Usage: route <task-name> <domain> <priority> [description]');
    process.exit(1);
  }

  const [taskName, domain, priority, ...descParts] = args;
  const description = descParts.join(' ') || 'No description provided';

  const task: Task = {
    task_id: `task-${Date.now()}`,
    task_name: taskName,
    description,
    domain: domain as TaskDomain,
    priority: priority as Priority,
    created_at: new Date().toISOString(),
    requester: 'cli',
  };

  console.log('Routing task:', JSON.stringify(task, null, 2));

  const decision = await coordinator.routeTask(task);

  console.log('\nRouting Decision:');
  console.log(JSON.stringify(decision, null, 2));

  if (decision.action === 'assign') {
    console.log(`\n✓ Task assigned to ${decision.contractor}`);
  } else if (decision.action === 'queue') {
    console.log(`\n⏸ Task queued for ${decision.contractor}`);
    console.log(`  Estimated start: ${decision.estimated_start_time || 'unknown'}`);
  } else {
    console.log(`\n⚠ Task escalated: ${decision.reason}`);
  }
}

async function handleSpawnPM(args: string[]) {
  if (args.length < 2) {
    console.error('Usage: spawn-pm <objective> <priority> [requirement1] [requirement2] ...');
    process.exit(1);
  }

  const [objective, priority, ...requirements] = args;

  const project: ProjectRequest = {
    objective,
    priority: priority as Priority,
    requirements: requirements.length > 0 ? requirements : ['Not specified'],
    success_criteria: ['Complete all requirements', 'Pass quality gates'],
    requester: 'cli',
  };

  console.log('Spawning PM for project:', JSON.stringify(project, null, 2));

  const pmRequest = await coordinator.spawnPM(project);

  console.log('\nPM Spawn Request:');
  console.log(JSON.stringify(pmRequest, null, 2));

  console.log(`\n✓ PM spawned: ${pmRequest.pm_id}`);
  console.log(`  Project ID: ${pmRequest.project_id}`);
  console.log(`  Token Budget: ${pmRequest.token_budget}`);
  console.log(`  Divisions: ${pmRequest.divisions_involved.join(', ')}`);
}

async function handleStatus() {
  const state = coordinator.getState();
  const queueStats = coordinator.getQueueStats();
  const loadMetrics = coordinator.getLoadMetrics();

  console.log('=== Coordinator Status ===\n');

  console.log('Active Tasks:', state.active_tasks.size);
  console.log('Active Projects:', state.active_projects.size);

  console.log('\n--- Queue Statistics ---');
  console.log('Total Depth:', queueStats.total_depth);
  console.log('By Priority:');
  for (const [priority, count] of Object.entries(queueStats.by_priority)) {
    console.log(`  ${priority}: ${count}`);
  }
  console.log(`Average Wait Time: ${(queueStats.avg_wait_time_ms / 1000 / 60).toFixed(1)} minutes`);
  console.log(`Oldest Task Wait: ${(queueStats.oldest_task_wait_ms / 1000 / 60).toFixed(1)} minutes`);

  console.log('\n--- Load Metrics ---');
  console.log(`Average Utilization: ${(loadMetrics.avg_utilization * 100).toFixed(1)}%`);
  console.log(`Max Utilization: ${(loadMetrics.max_utilization * 100).toFixed(1)}%`);
  console.log(`Load Imbalance Score: ${loadMetrics.load_imbalance_score.toFixed(2)}`);
  console.log(`Overloaded Contractors: ${loadMetrics.overloaded_contractors.length}`);
  console.log(`Available Contractors: ${loadMetrics.available_contractors.length}`);

  console.log('\n--- Contractor Health ---');
  for (const [contractor, health] of state.contractor_health.entries()) {
    console.log(`\n${contractor}:`);
    console.log(`  Health: ${health.health}`);
    console.log(`  Utilization: ${(health.current_load.utilization * 100).toFixed(1)}%`);
    console.log(`  Active Tasks: ${health.current_load.active_tasks}/${health.current_load.capacity}`);
    console.log(`  Tokens: ${health.current_load.tokens_remaining}/${health.current_load.tokens_remaining + health.current_load.tokens_allocated}`);
    console.log(`  Success Rate: ${(health.performance_metrics.success_rate * 100).toFixed(1)}%`);
  }

  console.log('\n--- Metrics ---');
  console.log('Tasks Routed Today:', state.metrics.tasks_routed_today);
  console.log(`Avg Routing Time: ${state.metrics.avg_routing_time_ms.toFixed(0)}ms`);
  console.log('Escalations Today:', state.metrics.escalations_today);
  console.log('Queue Depth Average:', state.metrics.queue_depth_avg);
}

async function handleProcessQueue() {
  console.log('Processing queue...');

  coordinator.checkStarvation();
  const assigned = await coordinator.processQueue();

  console.log(`\n✓ Assigned ${assigned} queued tasks to available contractors`);

  const queueStats = coordinator.getQueueStats();
  console.log(`Remaining queue depth: ${queueStats.total_depth}`);
}

async function handleMetrics() {
  const loadMetrics = coordinator.getLoadMetrics();

  console.log('=== Load Metrics ===\n');
  console.log(JSON.stringify(loadMetrics, null, 2));
}

function printUsage() {
  console.log(`
Cortex Coordinator Agent CLI

Usage:
  coordinator <command> [options]

Commands:
  route <task-name> <domain> <priority> [description]
    Route a task to appropriate contractor
    Domains: vm_provisioning, network_configuration, dns_management,
             kubernetes_cluster, k8s_workloads, workflow_automation,
             integration_design, multi_system_orchestration
    Priorities: p0_critical, p1_high, p2_medium, p3_low

  spawn-pm <objective> <priority> [requirement1] [requirement2] ...
    Spawn a PM agent for a complex project

  status
    Show coordinator status, queue stats, and contractor health

  process-queue
    Process queued tasks and assign to available contractors

  metrics
    Show load balancing metrics

Examples:
  coordinator route "Deploy VM" vm_provisioning p1_high "Deploy VM for staging"
  coordinator spawn-pm "Build K8s Cluster" p1_high "3 control planes" "5 workers"
  coordinator status
  coordinator process-queue
`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
