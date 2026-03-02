/**
 * Coordinator Agent
 * Main orchestrator for task routing, contractor selection, and PM spawning
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  Task,
  Priority,
  ContractorType,
  ContractorHealth,
  RoutingDecision,
  CoordinatorState,
  ProjectRequest,
  PMSpawnRequest,
  Handoff,
} from '../types';
import { ComplexityScorer } from '../utils/complexity-scorer';
import { PriorityScorer } from '../utils/priority-scorer';
import { ContractorSelector } from './contractor-selector';
import { QueueManager } from './queue-manager';
import { LoadBalancer } from './load-balancer';

export class CoordinatorAgent {
  private complexityScorer: ComplexityScorer;
  private priorityScorer: PriorityScorer;
  private contractorSelector: ContractorSelector;
  private queueManager: QueueManager;
  private loadBalancer: LoadBalancer;
  private state: CoordinatorState;
  private basePath: string;

  constructor(basePath: string = '/Users/ryandahlberg/Projects/cortex') {
    this.basePath = basePath;
    this.complexityScorer = new ComplexityScorer();
    this.priorityScorer = new PriorityScorer();
    this.contractorSelector = new ContractorSelector();
    this.queueManager = new QueueManager();
    this.loadBalancer = new LoadBalancer();

    // Initialize state
    this.state = {
      active_tasks: new Map(),
      queues: this.queueManager.getState(),
      contractor_health: this.initializeContractorHealth(),
      active_projects: new Map(),
      metrics: {
        tasks_routed_today: 0,
        avg_routing_time_ms: 0,
        escalations_today: 0,
        queue_depth_avg: 0,
      },
      last_updated: new Date().toISOString(),
    };

    this.log('Coordinator Agent initialized');
  }

  /**
   * Route a task to appropriate contractor
   */
  public async routeTask(task: Task): Promise<RoutingDecision> {
    const startTime = Date.now();
    this.log(`Routing task ${task.task_id}: ${task.task_name}`);

    // Step 1: Calculate complexity if not provided
    if (!task.complexity) {
      task.complexity = this.complexityScorer.quickScore(task);
      this.log(
        `Complexity scored: ${task.complexity.final_score} (${task.complexity.classification})`
      );
    }

    // Step 2: Make routing decision
    const decision = this.contractorSelector.selectContractor(
      task,
      this.state.contractor_health,
      task.priority
    );

    this.log(`Routing decision: ${decision.action} to ${decision.contractor}`);

    // Step 3: Execute decision
    switch (decision.action) {
      case 'assign':
        await this.assignTask(task, decision.contractor);
        break;
      case 'queue':
        this.queueTask(task, decision);
        break;
      case 'escalate':
        await this.escalateTask(task, decision);
        break;
    }

    // Update metrics
    const routingTime = Date.now() - startTime;
    this.updateMetrics(routingTime, decision.action === 'escalate');

    return decision;
  }

  /**
   * Assign task to contractor
   */
  private async assignTask(
    task: Task,
    contractor: ContractorType
  ): Promise<void> {
    this.log(`Assigning task ${task.task_id} to ${contractor}`);

    // Create handoff file
    const handoff: Handoff = {
      handoff_id: `coord-${uuidv4()}`,
      from_division: 'coordinator',
      to_division: contractor.replace('-contractor', ''),
      handoff_type: 'task_delegation',
      priority: task.priority,
      created_at: new Date().toISOString(),
      context: {
        summary: task.task_name,
        details: {
          task_id: task.task_id,
          domain: task.domain,
          description: task.description,
          complexity: task.complexity,
        },
        requirements: task.metadata?.requirements || [],
        acceptance_criteria: task.metadata?.acceptance_criteria || [],
        deadline: task.deadline,
      },
      status: 'pending',
    };

    // Write handoff file
    await this.createHandoff(handoff, contractor);

    // Update state
    this.state.active_tasks.set(task.task_id, task);

    // Update contractor load
    const health = this.state.contractor_health.get(contractor);
    if (health && task.complexity) {
      health.current_load.active_tasks++;
      health.current_load.tokens_allocated += task.complexity.estimated_tokens;
      health.current_load.tokens_remaining -= task.complexity.estimated_tokens;
      health.current_load.utilization =
        health.current_load.active_tasks / health.current_load.capacity;
    }
  }

  /**
   * Queue task for later execution
   */
  private queueTask(task: Task, decision: RoutingDecision): void {
    this.log(`Queueing task ${task.task_id} for ${decision.contractor}`);

    // Calculate priority score (if not already calculated)
    const priorityScore = this.calculatePriorityScore(task);

    this.queueManager.enqueue(task, priorityScore, decision.contractor);

    // Update metrics
    this.state.metrics.queue_depth_avg = this.queueManager.getQueueDepth();
  }

  /**
   * Escalate task to COO or higher
   */
  private async escalateTask(
    task: Task,
    decision: RoutingDecision
  ): Promise<void> {
    this.log(
      `Escalating task ${task.task_id}: ${decision.reason}`,
      'warning'
    );

    // Create escalation handoff
    const escalation: Handoff = {
      handoff_id: `escalation-${uuidv4()}`,
      from_division: 'coordinator',
      to_division: 'coo',
      handoff_type: 'escalation',
      priority: task.priority,
      created_at: new Date().toISOString(),
      context: {
        summary: `Escalation: ${task.task_name}`,
        details: {
          task_id: task.task_id,
          escalation_reason: decision.reason,
          complexity: task.complexity,
          attempted_contractors: [decision.contractor],
        },
        requirements: [],
        acceptance_criteria: [],
      },
      status: 'pending',
    };

    // Write escalation file
    const escalationPath = path.join(
      this.basePath,
      'coordination',
      'escalations',
      `${escalation.handoff_id}.json`
    );
    fs.mkdirSync(path.dirname(escalationPath), { recursive: true });
    fs.writeFileSync(escalationPath, JSON.stringify(escalation, null, 2));

    this.state.metrics.escalations_today++;
  }

  /**
   * Spawn PM agent for complex project
   */
  public async spawnPM(project: ProjectRequest): Promise<PMSpawnRequest> {
    this.log(`Spawning PM for project: ${project.objective}`);

    const projectId = project.project_id || `proj-${uuidv4()}`;
    const pmId = `pm-${projectId}`;

    // Estimate complexity and resources
    const estimatedComplexity = project.estimated_complexity || 7.0;
    const tokenBudget = this.estimateProjectTokens(estimatedComplexity);

    // Identify divisions involved
    const divisionsInvolved = this.identifyDivisionsForProject(project);

    const pmRequest: PMSpawnRequest = {
      pm_id: pmId,
      project_id: projectId,
      project_objective: project.objective,
      estimated_complexity: estimatedComplexity,
      token_budget: tokenBudget,
      divisions_involved: divisionsInvolved,
      created_at: new Date().toISOString(),
      state: 'spawning',
    };

    // Create PM spawn file
    const pmSpawnPath = path.join(
      this.basePath,
      'coordination',
      'project-management',
      'pm-spawns',
      `${pmId}.json`
    );
    fs.mkdirSync(path.dirname(pmSpawnPath), { recursive: true });
    fs.writeFileSync(
      pmSpawnPath,
      JSON.stringify(
        {
          ...pmRequest,
          project_details: project,
        },
        null,
        2
      )
    );

    // Track active project
    this.state.active_projects.set(projectId, pmRequest);

    this.log(`PM spawned: ${pmId} for project ${projectId}`);

    return pmRequest;
  }

  /**
   * Process queue - assign queued tasks to available contractors
   */
  public async processQueue(): Promise<number> {
    this.log('Processing queue...');

    let assignedCount = 0;

    // Check each contractor for availability
    for (const [
      contractor,
      health,
    ] of this.state.contractor_health.entries()) {
      if (health.current_load.utilization >= 0.80) {
        continue; // Skip busy contractors
      }

      // Try to dequeue a task for this contractor
      const item = this.queueManager.dequeue(contractor);
      if (item) {
        await this.assignTask(item.task, contractor);
        assignedCount++;
        this.log(`Assigned queued task ${item.task.task_id} to ${contractor}`);
      }
    }

    return assignedCount;
  }

  /**
   * Check for starvation and promote tasks
   */
  public checkStarvation(): void {
    const promotions = this.queueManager.checkStarvation();

    for (const promotion of promotions) {
      this.log(
        `Promoted task ${promotion.task_id} from ${promotion.old_priority} to ${promotion.new_priority}`,
        'warning'
      );
    }
  }

  /**
   * Get load metrics
   */
  public getLoadMetrics() {
    return this.loadBalancer.getLoadMetrics(this.state.contractor_health);
  }

  /**
   * Get queue statistics
   */
  public getQueueStats() {
    return this.queueManager.getStats();
  }

  /**
   * Get coordinator state
   */
  public getState(): CoordinatorState {
    return {
      ...this.state,
      queues: this.queueManager.getState(),
    };
  }

  // Helper methods

  private calculatePriorityScore(task: Task): number {
    // Use metadata if available, otherwise use defaults
    const impact = task.metadata?.impact || 5;
    const urgency = task.metadata?.urgency || 5;
    const businessValue = task.metadata?.business_value || 5;
    const risk = task.metadata?.risk || 5;

    const scoring = this.priorityScorer.scorePriority({
      impact,
      urgency,
      business_value: businessValue,
      risk,
    });

    return scoring.final_score;
  }

  private estimateProjectTokens(complexity: number): number {
    // Simple formula: complexity * 10k tokens
    const baseTokens = Math.round(complexity * 10000);
    // Add 20% buffer
    return Math.round(baseTokens * 1.2);
  }

  private identifyDivisionsForProject(project: ProjectRequest): string[] {
    const divisions: Set<string> = new Set();

    // Parse requirements to identify divisions
    const requirementsText = project.requirements.join(' ').toLowerCase();

    if (
      requirementsText.includes('vm') ||
      requirementsText.includes('infrastructure') ||
      requirementsText.includes('network')
    ) {
      divisions.add('infrastructure');
    }

    if (
      requirementsText.includes('kubernetes') ||
      requirementsText.includes('k8s') ||
      requirementsText.includes('container')
    ) {
      divisions.add('containers');
    }

    if (
      requirementsText.includes('workflow') ||
      requirementsText.includes('automation') ||
      requirementsText.includes('integration')
    ) {
      divisions.add('workflows');
    }

    if (
      requirementsText.includes('monitoring') ||
      requirementsText.includes('observability')
    ) {
      divisions.add('monitoring');
    }

    // Default to infrastructure if none identified
    if (divisions.size === 0) {
      divisions.add('infrastructure');
    }

    return Array.from(divisions);
  }

  private async createHandoff(
    handoff: Handoff,
    contractor: ContractorType
  ): Promise<void> {
    const division = contractor.replace('-contractor', '');
    const handoffPath = path.join(
      this.basePath,
      'coordination',
      'divisions',
      division,
      'handoffs',
      'from-coordinator',
      `${handoff.handoff_id}.json`
    );

    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, JSON.stringify(handoff, null, 2));
  }

  private updateMetrics(routingTimeMs: number, wasEscalation: boolean): void {
    this.state.metrics.tasks_routed_today++;

    // Update average routing time (rolling average)
    const currentAvg = this.state.metrics.avg_routing_time_ms;
    const count = this.state.metrics.tasks_routed_today;
    this.state.metrics.avg_routing_time_ms =
      (currentAvg * (count - 1) + routingTimeMs) / count;

    if (wasEscalation) {
      this.state.metrics.escalations_today++;
    }

    this.state.last_updated = new Date().toISOString();
  }

  private initializeContractorHealth(): Map<ContractorType, ContractorHealth> {
    const contractors: ContractorType[] = [
      'infrastructure-contractor',
      'talos-contractor',
      'n8n-contractor',
    ];

    const healthMap = new Map<ContractorType, ContractorHealth>();

    for (const contractor of contractors) {
      healthMap.set(contractor, {
        contractor_id: contractor,
        health: 'healthy',
        current_load: {
          active_tasks: 0,
          capacity: 5,
          utilization: 0,
          tokens_allocated: 0,
          tokens_remaining: 25000,
        },
        performance_metrics: {
          avg_response_time: '45 minutes',
          success_rate: 0.96,
          sla_compliance: 0.98,
        },
        availability: 'available',
      });
    }

    return healthMap;
  }

  private log(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    const timestamp = new Date().toISOString();
    const prefix = level === 'error' ? 'ERROR' : level === 'warning' ? 'WARN' : 'INFO';
    console.log(`[${timestamp}] [COORDINATOR] [${prefix}] ${message}`);

    // Write to log file
    const logPath = path.join(this.basePath, 'agents', 'coordinator', 'coordinator.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `[${timestamp}] [${prefix}] ${message}\n`);
  }
}
