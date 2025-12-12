/**
 * Contractor Selection Matrix
 * Routes tasks to appropriate contractors based on domain and availability
 */

import { Task, ContractorType, ContractorHealth, RoutingDecision, Priority } from '../types';

interface ContractorMapping {
  primary: ContractorType;
  backup?: ContractorType;
  escalation_target: string;
}

const DOMAIN_TO_CONTRACTOR_MAP: Record<string, ContractorMapping> = {
  vm_provisioning: {
    primary: 'infrastructure-contractor',
    escalation_target: 'coo',
  },
  network_configuration: {
    primary: 'infrastructure-contractor',
    escalation_target: 'coo',
  },
  dns_management: {
    primary: 'infrastructure-contractor',
    escalation_target: 'coo',
  },
  kubernetes_cluster: {
    primary: 'talos-contractor',
    backup: 'infrastructure-contractor',
    escalation_target: 'coo',
  },
  k8s_workloads: {
    primary: 'talos-contractor',
    escalation_target: 'coo',
  },
  workflow_automation: {
    primary: 'n8n-contractor',
    escalation_target: 'coo',
  },
  integration_design: {
    primary: 'n8n-contractor',
    escalation_target: 'coo',
  },
  multi_system_orchestration: {
    primary: 'infrastructure-contractor',
    escalation_target: 'coo',
  },
};

interface SelectionCriteria {
  domain_match: number;
  available_capacity: number;
  success_rate: number;
  sla_compliance: number;
}

const SELECTION_WEIGHTS = {
  domain_match: 0.50,
  available_capacity: 0.30,
  success_rate: 0.15,
  sla_compliance: 0.05,
};

export class ContractorSelector {
  /**
   * Select best contractor for a task
   */
  public selectContractor(
    task: Task,
    contractorHealth: Map<ContractorType, ContractorHealth>,
    priority: Priority
  ): RoutingDecision {
    // Get domain mapping
    const mapping = DOMAIN_TO_CONTRACTOR_MAP[task.domain];
    if (!mapping) {
      return {
        task_id: task.task_id,
        contractor: 'infrastructure-contractor', // fallback
        action: 'escalate',
        priority,
        complexity_score: task.complexity!,
        reason: `No contractor mapping found for domain: ${task.domain}`,
      };
    }

    // Check primary contractor availability
    const primaryHealth = contractorHealth.get(mapping.primary);
    if (!primaryHealth) {
      return {
        task_id: task.task_id,
        contractor: mapping.primary,
        action: 'escalate',
        priority,
        complexity_score: task.complexity!,
        reason: `Primary contractor ${mapping.primary} health unknown`,
      };
    }

    // Evaluate primary contractor
    const primaryAvailable = this.isContractorAvailable(
      primaryHealth,
      task.complexity!.estimated_tokens,
      priority
    );

    if (primaryAvailable.available) {
      return {
        task_id: task.task_id,
        contractor: mapping.primary,
        backup_contractor: mapping.backup,
        action: 'assign',
        priority,
        complexity_score: task.complexity!,
        reason: `Primary contractor available (utilization: ${primaryHealth.current_load.utilization.toFixed(2)})`,
      };
    }

    // Check backup contractor if available
    if (mapping.backup) {
      const backupHealth = contractorHealth.get(mapping.backup);
      if (backupHealth) {
        const backupAvailable = this.isContractorAvailable(
          backupHealth,
          task.complexity!.estimated_tokens,
          priority
        );
        if (backupAvailable.available) {
          return {
            task_id: task.task_id,
            contractor: mapping.backup,
            action: 'assign',
            priority,
            complexity_score: task.complexity!,
            reason: `Primary overloaded, using backup contractor (utilization: ${backupHealth.current_load.utilization.toFixed(2)})`,
          };
        }
      }
    }

    // All contractors overloaded - decide action based on priority
    if (priority === 'p0_critical') {
      return {
        task_id: task.task_id,
        contractor: mapping.primary,
        action: 'escalate',
        priority,
        complexity_score: task.complexity!,
        reason: `P0 task but all contractors overloaded - escalating for capacity decision`,
      };
    }

    // Queue for other priorities
    return {
      task_id: task.task_id,
      contractor: mapping.primary,
      backup_contractor: mapping.backup,
      action: 'queue',
      priority,
      complexity_score: task.complexity!,
      reason: `All contractors overloaded - queueing task`,
      estimated_start_time: this.estimateStartTime(primaryHealth),
    };
  }

  /**
   * Check if contractor is available for task
   */
  private isContractorAvailable(
    health: ContractorHealth,
    estimatedTokens: number,
    priority: Priority
  ): { available: boolean; reason?: string } {
    // Check health status
    if (health.health === 'unhealthy') {
      return { available: false, reason: 'Contractor unhealthy' };
    }

    // Check token availability
    if (health.current_load.tokens_remaining < estimatedTokens) {
      return { available: false, reason: 'Insufficient tokens' };
    }

    // Utilization thresholds based on priority
    const utilization = health.current_load.utilization;

    if (utilization < 0.80) {
      return { available: true }; // Available for all priorities
    }

    if (utilization < 0.90) {
      // Available only for P0/P1
      if (priority === 'p0_critical' || priority === 'p1_high') {
        return { available: true };
      }
      return { available: false, reason: 'Busy, only accepting high priority' };
    }

    // > 90% utilization - escalate even for P0
    return { available: false, reason: 'Overloaded' };
  }

  /**
   * Calculate contractor selection score
   */
  private calculateScore(
    contractor: ContractorType,
    isDomainMatch: boolean,
    health: ContractorHealth
  ): number {
    const criteria: SelectionCriteria = {
      domain_match: isDomainMatch ? 10 : 5,
      available_capacity: (1 - health.current_load.utilization) * 10,
      success_rate: health.performance_metrics.success_rate * 10,
      sla_compliance: health.performance_metrics.sla_compliance * 10,
    };

    return (
      criteria.domain_match * SELECTION_WEIGHTS.domain_match +
      criteria.available_capacity * SELECTION_WEIGHTS.available_capacity +
      criteria.success_rate * SELECTION_WEIGHTS.success_rate +
      criteria.sla_compliance * SELECTION_WEIGHTS.sla_compliance
    );
  }

  /**
   * Estimate when contractor will be available
   */
  private estimateStartTime(health: ContractorHealth): string {
    // Simple estimation: assume average task takes response time
    const avgMinutes = parseInt(health.performance_metrics.avg_response_time) || 45;
    const queuedTasks = health.current_load.active_tasks;
    const estimatedMinutes = Math.max(0, (queuedTasks - health.current_load.capacity + 1)) * avgMinutes;

    const startTime = new Date(Date.now() + estimatedMinutes * 60 * 1000);
    return startTime.toISOString();
  }

  /**
   * Check if contractor can be preempted for higher priority work
   */
  public canPreempt(
    contractor: ContractorType,
    currentPriority: Priority,
    newPriority: Priority
  ): boolean {
    const priorityRank: Record<Priority, number> = {
      p0_critical: 0,
      p1_high: 1,
      p2_medium: 2,
      p3_low: 3,
    };

    // P0 can preempt all
    if (newPriority === 'p0_critical') {
      return true;
    }

    // P1 can preempt P2/P3
    if (newPriority === 'p1_high' && priorityRank[currentPriority] > 1) {
      return true;
    }

    return false;
  }
}
