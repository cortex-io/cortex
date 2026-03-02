/**
 * Load Balancer
 * Distributes work across contractors based on capacity and performance
 */

import { ContractorType, ContractorHealth, Task } from '../types';

interface LoadMetrics {
  avg_utilization: number;
  max_utilization: number;
  load_imbalance_score: number;
  overloaded_contractors: ContractorType[];
  available_contractors: ContractorType[];
}

export class LoadBalancer {
  /**
   * Get best available contractor considering load
   */
  public selectLeastLoaded(
    candidates: ContractorType[],
    contractorHealth: Map<ContractorType, ContractorHealth>
  ): ContractorType | null {
    let bestContractor: ContractorType | null = null;
    let bestScore = -1;

    for (const contractor of candidates) {
      const health = contractorHealth.get(contractor);
      if (!health || health.health === 'unhealthy') continue;

      const score = this.calculateLoadScore(health);
      if (score > bestScore) {
        bestScore = score;
        bestContractor = contractor;
      }
    }

    return bestContractor;
  }

  /**
   * Calculate load score for contractor selection
   * Score = (1 - utilization) * 0.5 + (success_rate) * 0.3 + (sla_compliance) * 0.2
   */
  private calculateLoadScore(health: ContractorHealth): number {
    const utilizationScore = (1 - health.current_load.utilization) * 0.5;
    const successScore = health.performance_metrics.success_rate * 0.3;
    const slaScore = health.performance_metrics.sla_compliance * 0.2;

    return utilizationScore + successScore + slaScore;
  }

  /**
   * Get load metrics across all contractors
   */
  public getLoadMetrics(
    contractorHealth: Map<ContractorType, ContractorHealth>
  ): LoadMetrics {
    const utilizations: number[] = [];
    const overloaded: ContractorType[] = [];
    const available: ContractorType[] = [];

    for (const [contractor, health] of contractorHealth.entries()) {
      const utilization = health.current_load.utilization;
      utilizations.push(utilization);

      if (utilization >= 0.90) {
        overloaded.push(contractor);
      } else if (utilization < 0.80) {
        available.push(contractor);
      }
    }

    const avgUtilization =
      utilizations.reduce((sum, u) => sum + u, 0) / utilizations.length;
    const maxUtilization = Math.max(...utilizations);

    // Calculate load imbalance (standard deviation of utilizations)
    const variance =
      utilizations.reduce(
        (sum, u) => sum + Math.pow(u - avgUtilization, 2),
        0
      ) / utilizations.length;
    const loadImbalanceScore = Math.sqrt(variance);

    return {
      avg_utilization: avgUtilization,
      max_utilization: maxUtilization,
      load_imbalance_score: loadImbalanceScore,
      overloaded_contractors: overloaded,
      available_contractors: available,
    };
  }

  /**
   * Check if rebalancing is needed
   */
  public needsRebalancing(metrics: LoadMetrics): boolean {
    // Rebalance if:
    // 1. Load imbalance > 0.20 (poor balance)
    // 2. Some contractors overloaded while others available
    return (
      metrics.load_imbalance_score > 0.20 ||
      (metrics.overloaded_contractors.length > 0 &&
        metrics.available_contractors.length > 0)
    );
  }

  /**
   * Suggest task redistribution
   */
  public suggestRedistribution(
    overloadedContractor: ContractorType,
    availableContractors: ContractorType[],
    contractorHealth: Map<ContractorType, ContractorHealth>
  ): {
    target: ContractorType | null;
    reason: string;
  } {
    if (availableContractors.length === 0) {
      return {
        target: null,
        reason: 'No available contractors for redistribution',
      };
    }

    const target = this.selectLeastLoaded(
      availableContractors,
      contractorHealth
    );

    if (!target) {
      return {
        target: null,
        reason: 'No healthy contractors available',
      };
    }

    const targetHealth = contractorHealth.get(target)!;
    return {
      target,
      reason: `Redistribute to ${target} (utilization: ${targetHealth.current_load.utilization.toFixed(2)})`,
    };
  }

  /**
   * Check token budget status
   */
  public checkTokenBudget(
    contractor: ContractorType,
    health: ContractorHealth,
    requiredTokens: number
  ): {
    sufficient: boolean;
    remaining: number;
    utilization_pct: number;
    alert_level: 'ok' | 'warning' | 'critical' | 'emergency';
  } {
    const remaining = health.current_load.tokens_remaining;
    const total = remaining + health.current_load.tokens_allocated;
    const utilizationPct = (health.current_load.tokens_allocated / total) * 100;

    let alertLevel: 'ok' | 'warning' | 'critical' | 'emergency' = 'ok';
    if (utilizationPct >= 95) alertLevel = 'emergency';
    else if (utilizationPct >= 90) alertLevel = 'critical';
    else if (utilizationPct >= 75) alertLevel = 'warning';

    return {
      sufficient: remaining >= requiredTokens,
      remaining,
      utilization_pct: utilizationPct,
      alert_level: alertLevel,
    };
  }

  /**
   * Estimate wait time for contractor
   */
  public estimateWaitTime(
    contractor: ContractorType,
    health: ContractorHealth
  ): number {
    if (health.current_load.utilization < 0.80) {
      return 0; // Available now
    }

    // Parse avg response time (e.g., "45 minutes" -> 45)
    const avgMinutes =
      parseInt(health.performance_metrics.avg_response_time) || 45;

    // Estimate based on queue depth
    const queueDepth = Math.max(
      0,
      health.current_load.active_tasks - health.current_load.capacity
    );
    const estimatedMinutes = queueDepth * avgMinutes;

    return estimatedMinutes;
  }

  /**
   * Get utilization trend (for monitoring)
   */
  public getUtilizationTrend(
    contractorHealth: Map<ContractorType, ContractorHealth>
  ): Array<{ contractor: ContractorType; utilization: number; status: string }> {
    const trends: Array<{
      contractor: ContractorType;
      utilization: number;
      status: string;
    }> = [];

    for (const [contractor, health] of contractorHealth.entries()) {
      const utilization = health.current_load.utilization;
      let status = 'healthy';

      if (utilization >= 0.90) status = 'overloaded';
      else if (utilization >= 0.80) status = 'busy';
      else if (utilization >= 0.60) status = 'moderate';
      else status = 'available';

      trends.push({
        contractor,
        utilization: parseFloat(utilization.toFixed(2)),
        status,
      });
    }

    return trends.sort((a, b) => b.utilization - a.utilization);
  }

  /**
   * Check if contractor can accept task
   */
  public canAcceptTask(
    contractor: ContractorType,
    health: ContractorHealth,
    task: Task
  ): { can_accept: boolean; reason: string } {
    // Check health
    if (health.health === 'unhealthy') {
      return {
        can_accept: false,
        reason: `Contractor ${contractor} is unhealthy`,
      };
    }

    // Check utilization
    if (health.current_load.utilization >= 1.0) {
      return {
        can_accept: false,
        reason: `Contractor ${contractor} at full capacity`,
      };
    }

    // Check tokens
    if (!task.complexity) {
      return { can_accept: true, reason: 'No token check (complexity unknown)' };
    }

    const tokenCheck = this.checkTokenBudget(
      contractor,
      health,
      task.complexity.estimated_tokens
    );

    if (!tokenCheck.sufficient) {
      return {
        can_accept: false,
        reason: `Insufficient tokens (need: ${task.complexity.estimated_tokens}, have: ${tokenCheck.remaining})`,
      };
    }

    if (tokenCheck.alert_level === 'emergency') {
      return {
        can_accept: false,
        reason: `Token budget at ${tokenCheck.utilization_pct.toFixed(0)}% - emergency level`,
      };
    }

    return {
      can_accept: true,
      reason: `Available (utilization: ${health.current_load.utilization.toFixed(2)}, tokens: ${tokenCheck.remaining})`,
    };
  }
}
