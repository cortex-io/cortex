/**
 * Complexity Scoring Algorithm
 * Implementation of GM Decision Engine complexity scoring
 */

import { ComplexityScore, Task } from '../types';

interface ComplexityDimensions {
  technical_complexity: number;
  integration_points: number;
  unknowns_ambiguity: number;
  risk_level: number;
  dependencies: number;
}

interface ComplexityWeights {
  technical: number;
  integration: number;
  unknowns: number;
  risk: number;
  dependencies: number;
}

const DEFAULT_WEIGHTS: ComplexityWeights = {
  technical: 0.30,
  integration: 0.20,
  unknowns: 0.20,
  risk: 0.15,
  dependencies: 0.15,
};

export class ComplexityScorer {
  private weights: ComplexityWeights;

  constructor(weights: ComplexityWeights = DEFAULT_WEIGHTS) {
    this.weights = weights;
  }

  /**
   * Calculate complexity score for a task
   */
  public scoreTask(task: Task, dimensions: ComplexityDimensions): ComplexityScore {
    // Calculate weighted complexity score
    const finalScore = this.calculateFinalScore(dimensions);

    // Classify complexity
    const classification = this.classifyComplexity(finalScore);

    // Estimate resources
    const { estimatedTime, estimatedTokens, contractorCount, requiresEscalation } =
      this.estimateResources(finalScore, classification, dimensions.integration_points);

    return {
      final_score: parseFloat(finalScore.toFixed(1)),
      classification,
      dimensions,
      estimated_time_hours: estimatedTime,
      estimated_tokens: estimatedTokens,
      contractor_count: contractorCount,
      requires_escalation: requiresEscalation,
    };
  }

  /**
   * Calculate final weighted complexity score
   * Formula: (Technical * 0.30) + (Integration * 0.20) + (Unknowns * 0.20) + (Risk * 0.15) + (Dependencies * 0.15)
   */
  private calculateFinalScore(dimensions: ComplexityDimensions): number {
    return (
      dimensions.technical_complexity * this.weights.technical +
      dimensions.integration_points * this.weights.integration +
      dimensions.unknowns_ambiguity * this.weights.unknowns +
      dimensions.risk_level * this.weights.risk +
      dimensions.dependencies * this.weights.dependencies
    );
  }

  /**
   * Classify complexity based on final score
   */
  private classifyComplexity(score: number): ComplexityScore['classification'] {
    if (score <= 3.0) return 'simple';
    if (score <= 5.0) return 'moderate';
    if (score <= 7.0) return 'complex';
    if (score <= 8.5) return 'very_complex';
    return 'extremely_complex';
  }

  /**
   * Estimate resources based on complexity
   */
  private estimateResources(
    score: number,
    classification: ComplexityScore['classification'],
    integrationPoints: number
  ): {
    estimatedTime: number;
    estimatedTokens: number;
    contractorCount: number;
    requiresEscalation: boolean;
  } {
    // Base estimates by classification
    const estimates: Record<
      ComplexityScore['classification'],
      { time: [number, number]; tokens: [number, number]; contractors: number }
    > = {
      simple: { time: [0.5, 1.0], tokens: [500, 3000], contractors: 1 },
      moderate: { time: [1.0, 2.0], tokens: [3000, 6000], contractors: 1 },
      complex: { time: [2.0, 4.0], tokens: [6000, 12000], contractors: 2 },
      very_complex: { time: [4.0, 8.0], tokens: [12000, 20000], contractors: 3 },
      extremely_complex: { time: [8.0, 16.0], tokens: [20000, 50000], contractors: 4 },
    };

    const estimate = estimates[classification];

    // Integration factor adjustment
    const integrationFactor = 1 + (integrationPoints - 1) * 0.25;

    // Calculate estimates
    const avgTime = (estimate.time[0] + estimate.time[1]) / 2;
    const avgTokens = Math.round(
      ((estimate.tokens[0] + estimate.tokens[1]) / 2) * integrationFactor
    );

    // Escalation required for high complexity or score > 6.5
    const requiresEscalation = score > 6.5 || classification === 'very_complex' || classification === 'extremely_complex';

    return {
      estimatedTime: parseFloat(avgTime.toFixed(1)),
      estimatedTokens: avgTokens,
      contractorCount: estimate.contractors,
      requiresEscalation,
    };
  }

  /**
   * Quick scoring based on task metadata
   * Provides intelligent defaults when dimensions aren't explicitly provided
   */
  public quickScore(task: Task): ComplexityScore {
    // Infer dimensions from task domain and description
    const dimensions = this.inferDimensions(task);
    return this.scoreTask(task, dimensions);
  }

  /**
   * Infer complexity dimensions from task characteristics
   */
  private inferDimensions(task: Task): ComplexityDimensions {
    // Default values
    let technical = 3;
    let integration = 2;
    let unknowns = 3;
    let risk = 3;
    let dependencies = 2;

    // Adjust based on task domain
    switch (task.domain) {
      case 'vm_provisioning':
        technical = 2;
        integration = 2;
        risk = 3;
        break;
      case 'kubernetes_cluster':
        technical = 6;
        integration = 5;
        risk = 7;
        dependencies = 4;
        break;
      case 'multi_system_orchestration':
        technical = 7;
        integration = 8;
        risk = 8;
        dependencies = 6;
        break;
      case 'workflow_automation':
        technical = 5;
        integration = 6;
        unknowns = 4;
        break;
    }

    // Adjust based on priority (higher priority often means production/critical)
    if (task.priority === 'p0_critical') {
      risk = Math.min(risk + 2, 10);
    }

    // Adjust for unknowns based on description length (short = unclear)
    if (task.description && task.description.length < 50) {
      unknowns = Math.min(unknowns + 2, 10);
    }

    return {
      technical_complexity: technical,
      integration_points: integration,
      unknowns_ambiguity: unknowns,
      risk_level: risk,
      dependencies,
    };
  }
}
