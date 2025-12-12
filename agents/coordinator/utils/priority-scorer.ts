/**
 * Priority Scoring Algorithm
 * Implementation of GM Decision Engine priority scoring
 */

import { Priority, PriorityScoring } from '../types';

interface PriorityDimensions {
  impact: number; // 1-10: Single user (1-3) to Company-wide (9-10)
  urgency: number; // 1-10: Can wait weeks (1-3) to Must complete within hours (9-10)
  business_value: number; // 1-10: Internal tooling (1-3) to Revenue-impacting (9-10)
  risk: number; // 1-10: If not done, minimal impact (1-3) to crisis (9-10)
}

interface PriorityWeights {
  impact: number;
  urgency: number;
  business_value: number;
  risk: number;
}

const DEFAULT_WEIGHTS: PriorityWeights = {
  impact: 0.40,
  urgency: 0.30,
  business_value: 0.20,
  risk: 0.10,
};

export class PriorityScorer {
  private weights: PriorityWeights;

  constructor(weights: PriorityWeights = DEFAULT_WEIGHTS) {
    this.weights = weights;
  }

  /**
   * Calculate priority score and level
   * Formula: (Impact × 40%) + (Urgency × 30%) + (Business_Value × 20%) + (Risk × 10%)
   */
  public scorePriority(dimensions: PriorityDimensions): PriorityScoring {
    const finalScore =
      dimensions.impact * this.weights.impact +
      dimensions.urgency * this.weights.urgency +
      dimensions.business_value * this.weights.business_value +
      dimensions.risk * this.weights.risk;

    const priorityLevel = this.scoreToPriority(finalScore);

    return {
      impact: dimensions.impact,
      urgency: dimensions.urgency,
      business_value: dimensions.business_value,
      risk: dimensions.risk,
      final_score: parseFloat(finalScore.toFixed(1)),
      priority_level: priorityLevel,
    };
  }

  /**
   * Map priority score to priority level
   */
  private scoreToPriority(score: number): Priority {
    if (score >= 8.0) return 'p0_critical';
    if (score >= 6.0) return 'p1_high';
    if (score >= 4.0) return 'p2_medium';
    return 'p3_low';
  }

  /**
   * Get SLA response time in minutes for priority level
   */
  public getSLA(priority: Priority): number {
    const slaMap: Record<Priority, number> = {
      p0_critical: 15,
      p1_high: 60,
      p2_medium: 240,
      p3_low: 1440,
    };
    return slaMap[priority];
  }

  /**
   * Check if priority should preempt other work
   */
  public canPreempt(priority: Priority, currentPriority: Priority): boolean {
    const priorityRank: Record<Priority, number> = {
      p0_critical: 0,
      p1_high: 1,
      p2_medium: 2,
      p3_low: 3,
    };

    return priorityRank[priority] < priorityRank[currentPriority];
  }

  /**
   * Promote priority based on wait time (starvation prevention)
   */
  public checkStarvationPromotion(
    currentPriority: Priority,
    waitTimeHours: number
  ): Priority | null {
    if (currentPriority === 'p2_medium' && waitTimeHours > 8) {
      return 'p1_high';
    }
    if (currentPriority === 'p3_low' && waitTimeHours > 48) {
      return 'p2_medium';
    }
    return null;
  }
}
