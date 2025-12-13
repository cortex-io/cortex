#!/usr/bin/env node
/**
 * Project Management State Machine
 *
 * Manages project lifecycle with states, checkpoints, and transitions.
 * Implements finite state machine for project workflow management.
 *
 * States: PLANNING -> EXECUTING -> VALIDATING -> COMPLETE
 * Also handles: BLOCKED, FAILED, CANCELLED
 */

const fs = require('fs');
const path = require('path');
const CheckpointManager = require('./checkpoint-manager');
const RollbackCoordinator = require('./rollback-coordinator');

class ProjectStateMachine {
  constructor(options = {}) {
    this.cortexHome = options.cortexHome || process.env.CORTEX_HOME || path.join(__dirname, '../..');
    this.projectStatesDir = path.join(this.cortexHome, 'coordination/project-management/states');
    this.transitionLogPath = path.join(this.cortexHome, 'coordination/project-management/transitions.jsonl');

    this.checkpointManager = new CheckpointManager({ cortexHome: this.cortexHome });
    this.rollbackCoordinator = new RollbackCoordinator({ cortexHome: this.cortexHome });

    // Ensure directories exist
    this._ensureDirectories();

    // Define state machine
    this.states = this._defineStates();
  }

  /**
   * Define state machine structure
   * @private
   */
  _defineStates() {
    return {
      PLANNING: {
        next: ['EXECUTING', 'CANCELLED'],
        checkpoints: ['requirements_defined', 'resources_allocated', 'contractors_assigned'],
        actions: ['estimate_complexity', 'allocate_budget', 'select_contractors', 'create_execution_plan'],
        autoCheckpointAt: null
      },
      EXECUTING: {
        next: ['VALIDATING', 'BLOCKED', 'FAILED'],
        checkpoints: ['25%', '50%', '75%', 'code_complete'],
        actions: ['spawn_workers', 'monitor_progress', 'adjust_resources', 'handle_errors'],
        autoCheckpointAt: [0.25, 0.5, 0.75, 1.0] // Auto-checkpoint at progress milestones
      },
      VALIDATING: {
        next: ['COMPLETE', 'EXECUTING', 'FAILED'],
        checkpoints: ['tests_pass', 'security_scan_pass', 'approval_received'],
        actions: ['run_tests', 'security_scan', 'request_approval', 'verify_deliverables'],
        autoCheckpointAt: null
      },
      BLOCKED: {
        next: ['EXECUTING', 'FAILED', 'CANCELLED'],
        checkpoints: ['blocker_identified', 'resolution_plan'],
        actions: ['identify_blocker', 'create_resolution_plan', 'request_assistance'],
        autoCheckpointAt: null
      },
      FAILED: {
        next: ['EXECUTING', 'CANCELLED'], // Can retry or cancel
        checkpoints: ['failure_analyzed', 'rollback_complete'],
        actions: ['analyze_failure', 'rollback_changes', 'create_postmortem'],
        autoCheckpointAt: null
      },
      COMPLETE: {
        next: [],
        checkpoints: ['deployed', 'documented', 'archived'],
        actions: ['generate_report', 'update_knowledge_base', 'cleanup', 'notify_stakeholders'],
        autoCheckpointAt: null
      },
      CANCELLED: {
        next: [],
        checkpoints: ['cleanup_complete'],
        actions: ['cleanup_resources', 'notify_stakeholders', 'archive_artifacts'],
        autoCheckpointAt: null
      }
    };
  }

  /**
   * Create new project
   * @param {Object} projectData - Initial project data
   * @returns {Object} Project state
   */
  async createProject(projectData) {
    const projectId = projectData.project_id || `proj-${Date.now()}`;
    const timestamp = new Date().toISOString();

    const project = {
      project_id: projectId,
      task_id: projectData.task_id || null,
      state: 'PLANNING',
      previous_state: null,
      created_at: timestamp,
      updated_at: timestamp,
      completed_at: null,
      description: projectData.description || '',
      contractor: projectData.contractor || null,
      supporting_contractors: projectData.supporting_contractors || [],
      complexity: projectData.complexity || null,
      resources: {
        estimated_tokens: projectData.estimated_tokens || 0,
        actual_tokens: 0,
        estimated_time_minutes: projectData.estimated_time_minutes || 0,
        actual_time_minutes: 0,
        estimated_workers: projectData.estimated_workers || 1,
        active_workers: []
      },
      checkpoints: [],
      milestones: this._createMilestones(projectData),
      progress: {
        percentage: 0,
        current_phase: 'planning',
        phases_completed: 0,
        total_phases: 4 // planning, execution, validation, completion
      },
      validation: {
        tests_passed: false,
        security_scan_passed: false,
        approval_received: false,
        validation_errors: []
      },
      rollback_triggers: [],
      metadata: {
        priority: projectData.priority || 'medium',
        tags: projectData.tags || [],
        related_projects: projectData.related_projects || []
      },
      errors: []
    };

    // Create initial checkpoint
    await this.checkpointManager.createCheckpoint(
      projectId,
      'project_created',
      'PLANNING',
      project
    );

    // Save project state
    await this._saveProject(project);

    // Log transition
    this._logTransition(projectId, null, 'PLANNING', 'Project created');

    return project;
  }

  /**
   * Transition project to new state
   * @param {string} projectId
   * @param {string} newState
   * @param {Object} updates - Optional updates to apply
   * @returns {Object} Updated project
   */
  async transition(projectId, newState, updates = {}) {
    const project = await this.getProject(projectId);

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Validate transition
    const currentStateConfig = this.states[project.state];
    if (!currentStateConfig.next.includes(newState)) {
      throw new Error(`Invalid transition from ${project.state} to ${newState}`);
    }

    // Create checkpoint before transition
    await this.checkpointManager.createCheckpoint(
      projectId,
      `pre_transition_${newState.toLowerCase()}`,
      project.state,
      project
    );

    // Update project
    const previousState = project.state;
    project.previous_state = previousState;
    project.state = newState;
    project.updated_at = new Date().toISOString();

    // Apply any additional updates
    Object.assign(project, updates);

    // Update progress based on state
    this._updateProgress(project);

    // Handle state-specific actions
    await this._executeStateActions(project, newState);

    // Save project
    await this._saveProject(project);

    // Log transition
    this._logTransition(projectId, previousState, newState, updates.reason || 'State transition');

    return project;
  }

  /**
   * Update project progress
   * @param {string} projectId
   * @param {number} percentage - Progress percentage (0-100)
   * @returns {Object} Updated project
   */
  async updateProgress(projectId, percentage) {
    const project = await this.getProject(projectId);

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const oldPercentage = project.progress.percentage;
    project.progress.percentage = Math.max(0, Math.min(100, percentage));
    project.updated_at = new Date().toISOString();

    // Check for automatic checkpoints
    if (project.state === 'EXECUTING') {
      const autoCheckpoints = this.states.EXECUTING.autoCheckpointAt;
      const crossedCheckpoint = autoCheckpoints.find(cp => {
        const cpPercentage = cp * 100;
        return oldPercentage < cpPercentage && percentage >= cpPercentage;
      });

      if (crossedCheckpoint) {
        await this.checkpointManager.createCheckpoint(
          projectId,
          `progress_${Math.round(crossedCheckpoint * 100)}`,
          project.state,
          project
        );
      }
    }

    await this._saveProject(project);

    return project;
  }

  /**
   * Complete milestone
   * @param {string} projectId
   * @param {string} milestoneName
   * @returns {Object} Updated project
   */
  async completeMilestone(projectId, milestoneName) {
    const project = await this.getProject(projectId);

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const milestone = project.milestones.find(m => m.name === milestoneName);
    if (milestone) {
      milestone.completed = true;
      milestone.completed_at = new Date().toISOString();
      project.updated_at = new Date().toISOString();

      // Create checkpoint for milestone
      await this.checkpointManager.createCheckpoint(
        projectId,
        `milestone_${milestoneName}`,
        project.state,
        project
      );

      await this._saveProject(project);
    }

    return project;
  }

  /**
   * Trigger rollback
   * @param {string} projectId
   * @param {string} triggerType - Type of rollback trigger
   * @param {string} reason - Reason for rollback
   * @param {string} checkpointId - Optional specific checkpoint to restore
   * @returns {Object} Restored project state
   */
  async triggerRollback(projectId, triggerType, reason, checkpointId = null) {
    const project = await this.getProject(projectId);

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Record rollback trigger
    project.rollback_triggers.push({
      trigger_type: triggerType,
      triggered_at: new Date().toISOString(),
      reason: reason,
      checkpoint_restored: checkpointId
    });

    // Execute rollback
    const restoredState = await this.rollbackCoordinator.rollback(
      projectId,
      checkpointId,
      reason
    );

    // Update project with restored state
    Object.assign(project, restoredState);
    project.updated_at = new Date().toISOString();

    await this._saveProject(project);

    // Log transition to FAILED state
    await this.transition(projectId, 'FAILED', {
      reason: `Rollback triggered: ${reason}`
    });

    return project;
  }

  /**
   * Get project by ID
   * @param {string} projectId
   * @returns {Object|null} Project or null if not found
   */
  async getProject(projectId) {
    const projectPath = path.join(this.projectStatesDir, `${projectId}.json`);

    if (!fs.existsSync(projectPath)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(projectPath, 'utf8'));
    } catch (error) {
      console.error(`Error reading project ${projectId}:`, error.message);
      return null;
    }
  }

  /**
   * List all projects
   * @param {Object} filters - Optional filters
   * @returns {Array} Array of projects
   */
  async listProjects(filters = {}) {
    if (!fs.existsSync(this.projectStatesDir)) {
      return [];
    }

    const files = fs.readdirSync(this.projectStatesDir)
      .filter(f => f.endsWith('.json'));

    const projects = [];

    for (const file of files) {
      try {
        const project = JSON.parse(
          fs.readFileSync(path.join(this.projectStatesDir, file), 'utf8')
        );

        // Apply filters
        if (filters.state && project.state !== filters.state) continue;
        if (filters.contractor && project.contractor !== filters.contractor) continue;
        if (filters.priority && project.metadata.priority !== filters.priority) continue;

        projects.push(project);
      } catch (error) {
        console.error(`Error reading project file ${file}:`, error.message);
      }
    }

    return projects;
  }

  /**
   * Get project statistics
   * @returns {Object} Statistics
   */
  async getStatistics() {
    const projects = await this.listProjects();

    const stats = {
      total: projects.length,
      by_state: {},
      by_contractor: {},
      avg_completion_time: 0,
      success_rate: 0
    };

    // Count by state
    for (const state of Object.keys(this.states)) {
      stats.by_state[state] = projects.filter(p => p.state === state).length;
    }

    // Count by contractor
    const contractors = ['development', 'security', 'inventory', 'cicd'];
    for (const contractor of contractors) {
      stats.by_contractor[contractor] = projects.filter(p => p.contractor === contractor).length;
    }

    // Calculate metrics
    const completed = projects.filter(p => p.state === 'COMPLETE');
    const failed = projects.filter(p => p.state === 'FAILED');

    if (completed.length > 0) {
      const totalTime = completed.reduce((sum, p) => {
        if (p.completed_at && p.created_at) {
          const duration = new Date(p.completed_at) - new Date(p.created_at);
          return sum + duration;
        }
        return sum;
      }, 0);

      stats.avg_completion_time = Math.round(totalTime / completed.length / 1000 / 60); // minutes
    }

    const totalFinished = completed.length + failed.length;
    if (totalFinished > 0) {
      stats.success_rate = completed.length / totalFinished;
    }

    return stats;
  }

  /**
   * Update progress based on state
   * @private
   */
  _updateProgress(project) {
    const stateProgress = {
      PLANNING: 10,
      EXECUTING: 50,
      VALIDATING: 85,
      COMPLETE: 100,
      BLOCKED: project.progress.percentage, // Don't change
      FAILED: project.progress.percentage,
      CANCELLED: 0
    };

    if (stateProgress[project.state] !== undefined) {
      project.progress.percentage = Math.max(
        project.progress.percentage,
        stateProgress[project.state]
      );
    }

    // Update current phase
    const phaseMap = {
      PLANNING: 'planning',
      EXECUTING: 'execution',
      VALIDATING: 'validation',
      COMPLETE: 'completed',
      BLOCKED: 'blocked',
      FAILED: 'failed',
      CANCELLED: 'cancelled'
    };

    project.progress.current_phase = phaseMap[project.state] || 'unknown';

    // Count completed phases
    const phaseOrder = ['PLANNING', 'EXECUTING', 'VALIDATING', 'COMPLETE'];
    const currentIndex = phaseOrder.indexOf(project.state);
    if (currentIndex >= 0) {
      project.progress.phases_completed = currentIndex;
    }
  }

  /**
   * Execute state-specific actions
   * @private
   */
  async _executeStateActions(project, newState) {
    const actions = this.states[newState]?.actions || [];

    // Execute automatic actions
    for (const action of actions) {
      switch (action) {
        case 'generate_report':
          // Generate completion report
          project.metadata.report_generated = true;
          break;

        case 'cleanup':
          // Mark for cleanup
          project.metadata.cleanup_required = true;
          break;

        case 'analyze_failure':
          // Record failure analysis required
          project.metadata.failure_analysis_required = true;
          break;

        default:
          // Action handled externally
          break;
      }
    }
  }

  /**
   * Create milestones for project
   * @private
   */
  _createMilestones(projectData) {
    const defaultMilestones = [
      { name: 'requirements_defined', completed: false, completed_at: null },
      { name: 'resources_allocated', completed: false, completed_at: null },
      { name: 'code_complete', completed: false, completed_at: null },
      { name: 'tests_passed', completed: false, completed_at: null },
      { name: 'security_validated', completed: false, completed_at: null },
      { name: 'deployed', completed: false, completed_at: null },
      { name: 'documented', completed: false, completed_at: null }
    ];

    return projectData.milestones || defaultMilestones;
  }

  /**
   * Save project to disk
   * @private
   */
  async _saveProject(project) {
    const projectPath = path.join(this.projectStatesDir, `${project.project_id}.json`);
    fs.writeFileSync(projectPath, JSON.stringify(project, null, 2));
  }

  /**
   * Log state transition
   * @private
   */
  _logTransition(projectId, fromState, toState, reason) {
    const transition = {
      project_id: projectId,
      from_state: fromState,
      to_state: toState,
      reason: reason,
      timestamp: new Date().toISOString()
    };

    try {
      fs.appendFileSync(this.transitionLogPath, JSON.stringify(transition) + '\n');
    } catch (error) {
      console.error('Error logging transition:', error.message);
    }
  }

  /**
   * Ensure directories exist
   * @private
   */
  _ensureDirectories() {
    const dirs = [
      this.projectStatesDir,
      path.dirname(this.transitionLogPath)
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const sm = new ProjectStateMachine();

  switch (command) {
    case 'create':
      const projectData = JSON.parse(args[1] || '{}');
      sm.createProject(projectData)
        .then(project => console.log(JSON.stringify(project, null, 2)))
        .catch(err => console.error('Error:', err.message));
      break;

    case 'transition':
      const [projectId, newState] = args.slice(1);
      sm.transition(projectId, newState)
        .then(project => console.log(JSON.stringify(project, null, 2)))
        .catch(err => console.error('Error:', err.message));
      break;

    case 'get':
      sm.getProject(args[1])
        .then(project => console.log(JSON.stringify(project, null, 2)))
        .catch(err => console.error('Error:', err.message));
      break;

    case 'list':
      const filters = JSON.parse(args[1] || '{}');
      sm.listProjects(filters)
        .then(projects => console.log(JSON.stringify(projects, null, 2)))
        .catch(err => console.error('Error:', err.message));
      break;

    case 'stats':
      sm.getStatistics()
        .then(stats => console.log(JSON.stringify(stats, null, 2)))
        .catch(err => console.error('Error:', err.message));
      break;

    default:
      console.log('Usage: state-machine.js <command> [args]');
      console.log('Commands:');
      console.log('  create <json>         - Create new project');
      console.log('  transition <id> <state> - Transition project');
      console.log('  get <id>              - Get project');
      console.log('  list [filters]        - List projects');
      console.log('  stats                 - Get statistics');
      break;
  }
}

module.exports = ProjectStateMachine;
