/**
 * Priority Queue Manager
 * Manages task queueing with priority-based execution and starvation prevention
 */

import {
  Task,
  Priority,
  PriorityQueue,
  PriorityQueueItem,
  ContractorType,
} from '../types';

export class QueueManager {
  private queues: PriorityQueue;

  constructor() {
    this.queues = {
      p0_critical: [],
      p1_high: [],
      p2_medium: [],
      p3_low: [],
    };
  }

  /**
   * Enqueue a task
   */
  public enqueue(
    task: Task,
    priorityScore: number,
    contractor?: ContractorType
  ): void {
    const item: PriorityQueueItem = {
      task,
      priority_score: priorityScore,
      wait_time_ms: 0,
      contractor,
      enqueued_at: new Date().toISOString(),
    };

    const queueKey = this.priorityToQueueKey(task.priority);
    this.queues[queueKey].push(item);

    // Sort by priority score (descending) and enqueue time (ascending)
    this.queues[queueKey].sort((a, b) => {
      if (Math.abs(a.priority_score - b.priority_score) > 0.1) {
        return b.priority_score - a.priority_score;
      }
      return new Date(a.enqueued_at).getTime() - new Date(b.enqueued_at).getTime();
    });
  }

  /**
   * Dequeue highest priority task
   */
  public dequeue(contractor?: ContractorType): PriorityQueueItem | null {
    // Check queues in priority order
    const priorityOrder: Array<keyof PriorityQueue> = [
      'p0_critical',
      'p1_high',
      'p2_medium',
      'p3_low',
    ];

    for (const queueKey of priorityOrder) {
      const queue = this.queues[queueKey];
      if (queue.length === 0) continue;

      // If contractor specified, find first matching task
      if (contractor) {
        const index = queue.findIndex(
          (item) => !item.contractor || item.contractor === contractor
        );
        if (index !== -1) {
          const [item] = queue.splice(index, 1);
          this.updateWaitTime(item);
          return item;
        }
      } else {
        // Return first task
        const item = queue.shift()!;
        this.updateWaitTime(item);
        return item;
      }
    }

    return null;
  }

  /**
   * Peek at next task without removing
   */
  public peek(contractor?: ContractorType): PriorityQueueItem | null {
    const priorityOrder: Array<keyof PriorityQueue> = [
      'p0_critical',
      'p1_high',
      'p2_medium',
      'p3_low',
    ];

    for (const queueKey of priorityOrder) {
      const queue = this.queues[queueKey];
      if (queue.length === 0) continue;

      if (contractor) {
        const item = queue.find(
          (item) => !item.contractor || item.contractor === contractor
        );
        if (item) return item;
      } else {
        return queue[0];
      }
    }

    return null;
  }

  /**
   * Get queue depth for a priority level
   */
  public getQueueDepth(priority?: Priority): number {
    if (priority) {
      const queueKey = this.priorityToQueueKey(priority);
      return this.queues[queueKey].length;
    }

    // Total depth across all queues
    return Object.values(this.queues).reduce(
      (sum, queue) => sum + queue.length,
      0
    );
  }

  /**
   * Check for starvation and promote tasks if needed
   * Rule: P2 tasks waiting >8 hours promote to P1
   *       P3 tasks waiting >48 hours promote to P2
   */
  public checkStarvation(): Array<{ task_id: string; old_priority: Priority; new_priority: Priority }> {
    const promotions: Array<{ task_id: string; old_priority: Priority; new_priority: Priority }> = [];
    const now = Date.now();

    // Check P2 tasks for promotion to P1
    const p2Queue = this.queues.p2_medium;
    for (let i = p2Queue.length - 1; i >= 0; i--) {
      const item = p2Queue[i];
      const waitHours =
        (now - new Date(item.enqueued_at).getTime()) / (1000 * 60 * 60);

      if (waitHours > 8) {
        // Promote to P1
        const promoted = p2Queue.splice(i, 1)[0];
        promoted.task.priority = 'p1_high';
        this.queues.p1_high.push(promoted);
        promotions.push({
          task_id: promoted.task.task_id,
          old_priority: 'p2_medium',
          new_priority: 'p1_high',
        });
      }
    }

    // Check P3 tasks for promotion to P2
    const p3Queue = this.queues.p3_low;
    for (let i = p3Queue.length - 1; i >= 0; i--) {
      const item = p3Queue[i];
      const waitHours =
        (now - new Date(item.enqueued_at).getTime()) / (1000 * 60 * 60);

      if (waitHours > 48) {
        // Promote to P2
        const promoted = p3Queue.splice(i, 1)[0];
        promoted.task.priority = 'p2_medium';
        this.queues.p2_medium.push(promoted);
        promotions.push({
          task_id: promoted.task.task_id,
          old_priority: 'p3_low',
          new_priority: 'p2_medium',
        });
      }
    }

    // Re-sort affected queues
    if (promotions.length > 0) {
      this.sortQueue('p1_high');
      this.sortQueue('p2_medium');
    }

    return promotions;
  }

  /**
   * Get queue statistics
   */
  public getStats(): {
    total_depth: number;
    by_priority: Record<Priority, number>;
    avg_wait_time_ms: number;
    oldest_task_wait_ms: number;
  } {
    const now = Date.now();
    let totalWaitTime = 0;
    let taskCount = 0;
    let oldestWait = 0;

    const byPriority: Record<Priority, number> = {
      p0_critical: this.queues.p0_critical.length,
      p1_high: this.queues.p1_high.length,
      p2_medium: this.queues.p2_medium.length,
      p3_low: this.queues.p3_low.length,
    };

    for (const queue of Object.values(this.queues)) {
      for (const item of queue) {
        const waitTime = now - new Date(item.enqueued_at).getTime();
        totalWaitTime += waitTime;
        taskCount++;
        oldestWait = Math.max(oldestWait, waitTime);
      }
    }

    return {
      total_depth: taskCount,
      by_priority: byPriority,
      avg_wait_time_ms: taskCount > 0 ? totalWaitTime / taskCount : 0,
      oldest_task_wait_ms: oldestWait,
    };
  }

  /**
   * Get all queued tasks for a contractor
   */
  public getContractorQueue(contractor: ContractorType): PriorityQueueItem[] {
    const tasks: PriorityQueueItem[] = [];

    for (const queue of Object.values(this.queues)) {
      tasks.push(
        ...queue.filter(
          (item) => !item.contractor || item.contractor === contractor
        )
      );
    }

    return tasks;
  }

  /**
   * Remove a task from queue
   */
  public removeTask(taskId: string): boolean {
    for (const queue of Object.values(this.queues)) {
      const index = queue.findIndex((item) => item.task.task_id === taskId);
      if (index !== -1) {
        queue.splice(index, 1);
        return true;
      }
    }
    return false;
  }

  /**
   * Update wait time for item
   */
  private updateWaitTime(item: PriorityQueueItem): void {
    const now = Date.now();
    const enqueuedTime = new Date(item.enqueued_at).getTime();
    item.wait_time_ms = now - enqueuedTime;
  }

  /**
   * Sort a queue
   */
  private sortQueue(queueKey: keyof PriorityQueue): void {
    this.queues[queueKey].sort((a, b) => {
      if (Math.abs(a.priority_score - b.priority_score) > 0.1) {
        return b.priority_score - a.priority_score;
      }
      return new Date(a.enqueued_at).getTime() - new Date(b.enqueued_at).getTime();
    });
  }

  /**
   * Convert priority to queue key
   */
  private priorityToQueueKey(priority: Priority): keyof PriorityQueue {
    return priority;
  }

  /**
   * Clear all queues (for testing/reset)
   */
  public clear(): void {
    this.queues = {
      p0_critical: [],
      p1_high: [],
      p2_medium: [],
      p3_low: [],
    };
  }

  /**
   * Get current queue state
   */
  public getState(): PriorityQueue {
    return JSON.parse(JSON.stringify(this.queues));
  }
}
