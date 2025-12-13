import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Progress Reporter for Natural Language Interface
 *
 * Provides human-friendly progress updates for infrastructure tasks
 * Translates technical task status into user-friendly messages
 */

class ProgressReporter {
  constructor(decomposition) {
    this.decomposition = decomposition
    this.taskStatuses = {}
    this.phaseProgress = {}
    this.startTime = Date.now()

    // Initialize task statuses
    for (const task of decomposition.tasks) {
      this.taskStatuses[task.task_id] = {
        status: 'pending',
        progress: 0,
        message: '',
        started_at: null,
        completed_at: null
      }
    }
  }

  /**
   * Update task status
   */
  updateTaskStatus(taskId, status, progress = 0, message = '') {
    if (!this.taskStatuses[taskId]) {
      console.warn(`[ProgressReporter] Unknown task: ${taskId}`)
      return
    }

    const previousStatus = this.taskStatuses[taskId].status

    this.taskStatuses[taskId] = {
      ...this.taskStatuses[taskId],
      status,
      progress,
      message,
      updated_at: new Date().toISOString()
    }

    if (status === 'in_progress' && previousStatus === 'pending') {
      this.taskStatuses[taskId].started_at = new Date().toISOString()
    }

    if (status === 'completed' || status === 'failed') {
      this.taskStatuses[taskId].completed_at = new Date().toISOString()
    }

    // Update phase progress
    this.updatePhaseProgress()

    return this.getProgressReport()
  }

  /**
   * Update phase progress
   */
  updatePhaseProgress() {
    for (const phase of this.decomposition.execution_plan.phases) {
      const phaseTasks = phase.tasks.map(t => t.task_id)
      const completed = phaseTasks.filter(id => this.taskStatuses[id].status === 'completed').length
      const total = phaseTasks.length

      this.phaseProgress[phase.phase_number] = {
        completed,
        total,
        percentage: Math.round((completed / total) * 100)
      }
    }
  }

  /**
   * Get overall progress
   */
  getOverallProgress() {
    const totalTasks = this.decomposition.tasks.length
    const completedTasks = Object.values(this.taskStatuses).filter(s => s.status === 'completed').length
    const failedTasks = Object.values(this.taskStatuses).filter(s => s.status === 'failed').length
    const inProgressTasks = Object.values(this.taskStatuses).filter(s => s.status === 'in_progress').length

    const percentage = Math.round((completedTasks / totalTasks) * 100)

    return {
      percentage,
      completed_tasks: completedTasks,
      failed_tasks: failedTasks,
      in_progress_tasks: inProgressTasks,
      total_tasks: totalTasks,
      elapsed_time: this.getElapsedTime(),
      estimated_remaining: this.estimateRemainingTime()
    }
  }

  /**
   * Get elapsed time
   */
  getElapsedTime() {
    const elapsed = Date.now() - this.startTime
    const minutes = Math.floor(elapsed / 60000)
    const seconds = Math.floor((elapsed % 60000) / 1000)

    return {
      milliseconds: elapsed,
      formatted: `${minutes}m ${seconds}s`
    }
  }

  /**
   * Estimate remaining time
   */
  estimateRemainingTime() {
    const overall = this.getOverallProgress()

    if (overall.completed_tasks === 0) {
      return {
        milliseconds: null,
        formatted: 'Calculating...'
      }
    }

    const elapsed = Date.now() - this.startTime
    const avgTimePerTask = elapsed / overall.completed_tasks
    const remainingTasks = overall.total_tasks - overall.completed_tasks
    const estimated = avgTimePerTask * remainingTasks

    const minutes = Math.floor(estimated / 60000)
    const seconds = Math.floor((estimated % 60000) / 1000)

    return {
      milliseconds: estimated,
      formatted: `~${minutes}m ${seconds}s`
    }
  }

  /**
   * Get current phase
   */
  getCurrentPhase() {
    for (const phase of this.decomposition.execution_plan.phases) {
      const phaseTasks = phase.tasks.map(t => t.task_id)
      const allCompleted = phaseTasks.every(id => this.taskStatuses[id].status === 'completed')
      const anyInProgress = phaseTasks.some(id => this.taskStatuses[id].status === 'in_progress')

      if (!allCompleted) {
        return {
          phase_number: phase.phase_number,
          total_phases: this.decomposition.execution_plan.total_phases,
          tasks: phase.tasks,
          parallel: phase.parallel_execution,
          progress: this.phaseProgress[phase.phase_number] || { completed: 0, total: phaseTasks.length, percentage: 0 },
          status: anyInProgress ? 'in_progress' : 'pending'
        }
      }
    }

    return null
  }

  /**
   * Get progress report
   */
  getProgressReport() {
    const overall = this.getOverallProgress()
    const currentPhase = this.getCurrentPhase()

    let statusMessage = ''

    if (overall.percentage === 0) {
      statusMessage = 'Starting infrastructure deployment...'
    } else if (overall.percentage === 100) {
      if (overall.failed_tasks > 0) {
        statusMessage = `Completed with ${overall.failed_tasks} failed task(s)`
      } else {
        statusMessage = 'Infrastructure deployment completed successfully!'
      }
    } else if (currentPhase) {
      const currentTask = currentPhase.tasks.find(t =>
        this.taskStatuses[t.task_id].status === 'in_progress'
      )

      if (currentTask) {
        statusMessage = `Phase ${currentPhase.phase_number}/${currentPhase.total_phases}: ${currentTask.name}...`
      } else {
        statusMessage = `Phase ${currentPhase.phase_number}/${currentPhase.total_phases} starting...`
      }
    }

    return {
      status_message: statusMessage,
      overall_progress: overall,
      current_phase: currentPhase,
      task_statuses: this.taskStatuses,
      intent: this.decomposition.intent,
      description: this.decomposition.description
    }
  }

  /**
   * Get user-friendly summary
   */
  getSummary() {
    const report = this.getProgressReport()
    const lines = []

    lines.push(`\n${'='.repeat(60)}`)
    lines.push(`Infrastructure Request: ${this.decomposition.description}`)
    lines.push(`${'='.repeat(60)}`)
    lines.push(``)
    lines.push(`Status: ${report.status_message}`)
    lines.push(`Progress: ${report.overall_progress.percentage}% (${report.overall_progress.completed_tasks}/${report.overall_progress.total_tasks} tasks)`)
    lines.push(`Elapsed: ${report.overall_progress.elapsed_time.formatted}`)
    lines.push(`Remaining: ${report.overall_progress.estimated_remaining.formatted}`)
    lines.push(``)

    if (report.current_phase) {
      lines.push(`Current Phase: ${report.current_phase.phase_number}/${report.current_phase.total_phases}`)
      lines.push(`Phase Progress: ${report.current_phase.progress.percentage}%`)
      lines.push(``)

      lines.push(`Tasks in this phase:`)
      for (const task of report.current_phase.tasks) {
        const status = this.taskStatuses[task.task_id]
        const icon = status.status === 'completed' ? '✓' :
                     status.status === 'in_progress' ? '⟳' :
                     status.status === 'failed' ? '✗' : '○'

        lines.push(`  ${icon} ${task.name}`)
      }
    }

    lines.push(`\n${'='.repeat(60)}\n`)

    return lines.join('\n')
  }

  /**
   * Save progress to disk
   */
  saveProgress() {
    try {
      const progressPath = path.join(
        __dirname,
        '../../coordination/nl-interface-progress',
        `${this.decomposition.intent}-${Date.now()}.json`
      )

      const dir = path.dirname(progressPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      fs.writeFileSync(progressPath, JSON.stringify(this.getProgressReport(), null, 2))
    } catch (error) {
      console.error('[ProgressReporter] Error saving progress:', error.message)
    }
  }
}

export default ProgressReporter
