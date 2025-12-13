/**
 * Workflow Executor - Multi-Contractor Workflow Orchestration
 *
 * Executes complex multi-phase workflows that span multiple contractors.
 * Handles phase dependencies, input/output passing, rollback strategies,
 * and contractor handoffs.
 *
 * @module lib/orchestration/workflow-executor
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

class WorkflowExecutor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.workflowsDir = options.workflowsDir || path.join(__dirname, '../../coordination/workflows');
    this.knowledgeBasesDir = options.knowledgeBasesDir || path.join(__dirname, '../../coordination/contractors/knowledge-bases');
    this.eventsLog = options.eventsLog || path.join(__dirname, '../../coordination/dashboard-events.jsonl');
    this.executionStateDir = options.executionStateDir || path.join(__dirname, '../../coordination/workflow-executions');

    this.activeExecutions = new Map();
    this.contractorKnowledgeBases = new Map();
  }

  /**
   * Initialize workflow executor
   */
  async initialize() {
    // Ensure execution state directory exists
    await fs.mkdir(this.executionStateDir, { recursive: true });

    // Load contractor knowledge bases
    await this.loadContractorKnowledgeBases();

    this.emit('initialized', { timestamp: new Date().toISOString() });
  }

  /**
   * Load contractor knowledge bases for context-aware execution
   */
  async loadContractorKnowledgeBases() {
    try {
      const files = await fs.readdir(this.knowledgeBasesDir);

      for (const file of files) {
        if (file.endsWith('-kb.json')) {
          const filePath = path.join(this.knowledgeBasesDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          const kb = JSON.parse(content);

          this.contractorKnowledgeBases.set(kb.contractor_id, kb);
        }
      }

      console.log(`Loaded ${this.contractorKnowledgeBases.size} contractor knowledge bases`);
    } catch (error) {
      console.error('Failed to load contractor knowledge bases:', error);
      throw error;
    }
  }

  /**
   * Load workflow definition
   * @param {string} workflowId - Workflow identifier
   * @returns {Object} Workflow definition
   */
  async loadWorkflow(workflowId) {
    const workflowPath = path.join(this.workflowsDir, `${workflowId}.json`);

    try {
      const content = await fs.readFile(workflowPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load workflow ${workflowId}: ${error.message}`);
    }
  }

  /**
   * Execute a workflow
   * @param {string} workflowId - Workflow identifier
   * @param {Object} inputs - Initial workflow inputs
   * @param {Object} options - Execution options
   * @returns {Object} Execution result
   */
  async executeWorkflow(workflowId, inputs = {}, options = {}) {
    const workflow = await this.loadWorkflow(workflowId);
    const executionId = this.generateExecutionId(workflowId);

    const executionContext = {
      executionId,
      workflowId,
      workflow,
      inputs,
      options,
      startTime: Date.now(),
      status: 'running',
      currentPhase: null,
      phaseOutputs: {},
      errors: [],
      rollbackExecuted: false
    };

    this.activeExecutions.set(executionId, executionContext);

    try {
      await this.logEvent({
        event_type: 'workflow_started',
        executionId,
        workflowId,
        workflow_name: workflow.name,
        timestamp: new Date().toISOString()
      });

      // Execute phases in order
      for (let i = 0; i < workflow.phases.length; i++) {
        const phase = workflow.phases[i];

        // Check if phase should be skipped
        if (phase.optional && this.shouldSkipPhase(phase, executionContext)) {
          console.log(`Skipping optional phase ${phase.phase}: ${phase.name}`);
          continue;
        }

        // Check phase dependencies
        if (phase.depends_on_phase) {
          const dependencyMet = await this.checkPhaseDependency(phase, executionContext);
          if (!dependencyMet) {
            throw new Error(`Phase ${phase.phase} dependency not met: phase ${phase.depends_on_phase} did not complete successfully`);
          }
        }

        executionContext.currentPhase = phase.phase;

        await this.logEvent({
          event_type: 'phase_started',
          executionId,
          phase: phase.phase,
          phase_name: phase.name,
          contractor: phase.contractor,
          timestamp: new Date().toISOString()
        });

        try {
          const phaseResult = await this.executePhase(phase, executionContext);
          executionContext.phaseOutputs[phase.phase] = phaseResult.outputs;

          await this.logEvent({
            event_type: 'phase_completed',
            executionId,
            phase: phase.phase,
            phase_name: phase.name,
            outputs: phaseResult.outputs,
            timestamp: new Date().toISOString()
          });
        } catch (phaseError) {
          executionContext.errors.push({
            phase: phase.phase,
            error: phaseError.message,
            timestamp: new Date().toISOString()
          });

          await this.logEvent({
            event_type: 'phase_failed',
            executionId,
            phase: phase.phase,
            phase_name: phase.name,
            error: phaseError.message,
            timestamp: new Date().toISOString()
          });

          // Execute rollback if configured
          if (phase.rollback_strategy || workflow.global_rollback_strategy) {
            await this.executeRollback(executionContext, phase);
            executionContext.rollbackExecuted = true;
          }

          throw phaseError;
        }
      }

      // Workflow completed successfully
      executionContext.status = 'completed';
      executionContext.endTime = Date.now();
      executionContext.duration = executionContext.endTime - executionContext.startTime;

      await this.logEvent({
        event_type: 'workflow_completed',
        executionId,
        workflowId,
        duration_ms: executionContext.duration,
        outputs: executionContext.phaseOutputs,
        timestamp: new Date().toISOString()
      });

      // Save execution state
      await this.saveExecutionState(executionContext);

      return {
        success: true,
        executionId,
        outputs: executionContext.phaseOutputs,
        duration: executionContext.duration
      };

    } catch (error) {
      executionContext.status = 'failed';
      executionContext.endTime = Date.now();
      executionContext.duration = executionContext.endTime - executionContext.startTime;

      await this.logEvent({
        event_type: 'workflow_failed',
        executionId,
        workflowId,
        error: error.message,
        rollback_executed: executionContext.rollbackExecuted,
        timestamp: new Date().toISOString()
      });

      // Save execution state
      await this.saveExecutionState(executionContext);

      this.activeExecutions.delete(executionId);

      return {
        success: false,
        executionId,
        error: error.message,
        errors: executionContext.errors,
        rollbackExecuted: executionContext.rollbackExecuted,
        duration: executionContext.duration
      };
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Execute a single workflow phase
   * @param {Object} phase - Phase definition
   * @param {Object} executionContext - Execution context
   * @returns {Object} Phase result
   */
  async executePhase(phase, executionContext) {
    console.log(`Executing phase ${phase.phase}: ${phase.name} (contractor: ${phase.contractor})`);

    // Get contractor knowledge base for context
    const contractorKB = this.contractorKnowledgeBases.get(phase.contractor);

    if (!contractorKB) {
      console.warn(`Warning: No knowledge base found for contractor ${phase.contractor}`);
    }

    // Prepare inputs from previous phases
    const phaseInputs = this.preparePhaseInputs(phase, executionContext);

    // Execute tasks in phase
    const taskResults = {};
    const taskOutputs = {};

    for (const task of phase.tasks) {
      // Check task dependencies
      if (task.depends_on) {
        const dependenciesMet = task.depends_on.every(dep => taskResults[dep] && taskResults[dep].success);
        if (!dependenciesMet) {
          throw new Error(`Task ${task.task_id} dependencies not met`);
        }
      }

      console.log(`  Executing task: ${task.task_id}`);

      // Resolve task parameters with variable substitution
      const resolvedParams = this.resolveTaskParams(task.params, {
        ...phaseInputs,
        ...taskOutputs,
        executionContext
      });

      // Execute task (simulated - in real implementation, this would call MCP servers)
      const taskResult = await this.executeTask(task, resolvedParams, contractorKB);

      taskResults[task.task_id] = taskResult;
      taskOutputs[task.task_id] = taskResult.outputs || {};

      // Check success criteria
      if (task.success_criteria) {
        const criteriaMet = this.checkSuccessCriteria(task.success_criteria, taskResult);
        if (!criteriaMet) {
          throw new Error(`Task ${task.task_id} success criteria not met`);
        }
      }
    }

    // Prepare phase outputs
    const phaseOutputs = this.resolvePhaseOutputs(phase.outputs, taskOutputs);

    return {
      success: true,
      taskResults,
      outputs: phaseOutputs
    };
  }

  /**
   * Execute a single task (simulated)
   * @param {Object} task - Task definition
   * @param {Object} params - Resolved parameters
   * @param {Object} contractorKB - Contractor knowledge base
   * @returns {Object} Task result
   */
  async executeTask(task, params, contractorKB) {
    // In a real implementation, this would:
    // 1. Look up the MCP server and tool from contractorKB
    // 2. Call the MCP server with the tool and parameters
    // 3. Wait for the result
    // 4. Parse and return the result

    // For now, simulate task execution
    console.log(`    [SIMULATED] ${task.tool || task.task} with params:`, JSON.stringify(params, null, 2).substring(0, 100));

    // Simulate execution delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Return simulated success
    return {
      success: true,
      outputs: {
        // Simulated outputs based on task
        ...params,
        execution_time: Date.now(),
        simulated: true
      }
    };
  }

  /**
   * Prepare inputs for a phase from previous phase outputs
   * @param {Object} phase - Phase definition
   * @param {Object} executionContext - Execution context
   * @returns {Object} Phase inputs
   */
  preparePhaseInputs(phase, executionContext) {
    if (!phase.inputs_from_phase) {
      return {};
    }

    const inputs = {};

    for (const [sourcePhase, inputKeys] of Object.entries(phase.inputs_from_phase)) {
      const sourceOutputs = executionContext.phaseOutputs[sourcePhase];

      if (!sourceOutputs) {
        throw new Error(`Cannot find outputs from phase ${sourcePhase}`);
      }

      for (const key of inputKeys) {
        if (sourceOutputs[key] !== undefined) {
          inputs[key] = sourceOutputs[key];
        }
      }
    }

    return inputs;
  }

  /**
   * Resolve task parameters with variable substitution
   * @param {Object} params - Parameter template
   * @param {Object} context - Resolution context
   * @returns {Object} Resolved parameters
   */
  resolveTaskParams(params, context) {
    if (!params) return {};

    const resolved = {};

    for (const [key, value] of Object.entries(params)) {
      resolved[key] = this.resolveValue(value, context);
    }

    return resolved;
  }

  /**
   * Resolve a single value with variable substitution
   * @param {*} value - Value to resolve
   * @param {Object} context - Resolution context
   * @returns {*} Resolved value
   */
  resolveValue(value, context) {
    if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
      // Variable reference like ${phase1.outputs.vm_id}
      const path = value.slice(2, -1);
      return this.getNestedValue(context, path);
    } else if (typeof value === 'object' && value !== null) {
      // Recursively resolve object properties
      const resolved = Array.isArray(value) ? [] : {};
      for (const [k, v] of Object.entries(value)) {
        resolved[k] = this.resolveValue(v, context);
      }
      return resolved;
    } else {
      return value;
    }
  }

  /**
   * Get nested value from object using dot notation
   * @param {Object} obj - Object to search
   * @param {string} path - Dot-notation path
   * @returns {*} Value at path
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Resolve phase outputs from task outputs
   * @param {Object} outputTemplate - Output template
   * @param {Object} taskOutputs - Task outputs
   * @returns {Object} Resolved outputs
   */
  resolvePhaseOutputs(outputTemplate, taskOutputs) {
    if (!outputTemplate) return {};

    return this.resolveTaskParams(outputTemplate, taskOutputs);
  }

  /**
   * Check if success criteria are met
   * @param {Object} criteria - Success criteria
   * @param {Object} result - Task result
   * @returns {boolean} Whether criteria are met
   */
  checkSuccessCriteria(criteria, result) {
    // Simple implementation - check if all criteria keys exist and match in result
    for (const [key, expectedValue] of Object.entries(criteria)) {
      const actualValue = result.outputs?.[key];

      if (actualValue === undefined) {
        console.log(`Success criteria not met: ${key} is undefined`);
        return false;
      }

      if (expectedValue !== null && actualValue !== expectedValue) {
        console.log(`Success criteria not met: ${key} expected ${expectedValue}, got ${actualValue}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Check if phase dependency is met
   * @param {Object} phase - Phase definition
   * @param {Object} executionContext - Execution context
   * @returns {boolean} Whether dependency is met
   */
  async checkPhaseDependency(phase, executionContext) {
    const dependencyPhase = phase.depends_on_phase;
    return executionContext.phaseOutputs[dependencyPhase] !== undefined;
  }

  /**
   * Check if phase should be skipped
   * @param {Object} phase - Phase definition
   * @param {Object} executionContext - Execution context
   * @returns {boolean} Whether to skip phase
   */
  shouldSkipPhase(phase, executionContext) {
    if (!phase.skip_if) return false;

    // Evaluate skip condition (simple implementation)
    // In real implementation, this would evaluate complex conditions
    return false;
  }

  /**
   * Execute rollback strategy
   * @param {Object} executionContext - Execution context
   * @param {Object} failedPhase - Failed phase
   */
  async executeRollback(executionContext, failedPhase) {
    console.log(`Executing rollback for failed phase ${failedPhase.phase}`);

    await this.logEvent({
      event_type: 'rollback_started',
      executionId: executionContext.executionId,
      failed_phase: failedPhase.phase,
      timestamp: new Date().toISOString()
    });

    // Execute phase-specific rollback if defined
    if (failedPhase.rollback_strategy) {
      await this.executeRollbackTasks(failedPhase.rollback_strategy, executionContext);
    }

    // Execute global rollback if defined
    if (executionContext.workflow.global_rollback_strategy) {
      const globalRollback = executionContext.workflow.global_rollback_strategy;

      // Check if global rollback should be triggered
      const shouldTrigger = this.shouldTriggerGlobalRollback(globalRollback, failedPhase);

      if (shouldTrigger) {
        console.log('Executing global rollback strategy');
        await this.executeGlobalRollback(globalRollback, executionContext);
      }
    }

    await this.logEvent({
      event_type: 'rollback_completed',
      executionId: executionContext.executionId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Execute rollback tasks
   * @param {Object} rollbackStrategy - Rollback strategy
   * @param {Object} executionContext - Execution context
   */
  async executeRollbackTasks(rollbackStrategy, executionContext) {
    if (!rollbackStrategy.tasks) return;

    for (const task of rollbackStrategy.tasks) {
      console.log(`  Rollback task: ${task.tool}`);
      // Execute rollback task (simulated)
      await this.executeTask(task, task.params, null);
    }
  }

  /**
   * Execute global rollback
   * @param {Object} globalRollback - Global rollback strategy
   * @param {Object} executionContext - Execution context
   */
  async executeGlobalRollback(globalRollback, executionContext) {
    // Execute rollback steps in reverse order
    if (globalRollback.steps) {
      for (const step of globalRollback.steps.reverse()) {
        console.log(`  Global rollback step for phase ${step.phase}: ${step.action}`);
        // Execute rollback action (simulated)
      }
    }

    // Execute cleanup tasks
    if (globalRollback.cleanup_tasks) {
      for (const cleanup of globalRollback.cleanup_tasks) {
        console.log(`  Cleanup: ${cleanup}`);
        // Execute cleanup (simulated)
      }
    }
  }

  /**
   * Check if global rollback should be triggered
   * @param {Object} globalRollback - Global rollback strategy
   * @param {Object} failedPhase - Failed phase
   * @returns {boolean} Whether to trigger global rollback
   */
  shouldTriggerGlobalRollback(globalRollback, failedPhase) {
    if (!globalRollback.trigger_conditions) return false;

    for (const condition of globalRollback.trigger_conditions) {
      if (condition === 'any_phase_critical_failure') return true;
      if (condition.startsWith('phase_') && failedPhase.phase >= parseInt(condition.split('_')[1])) {
        return true;
      }
    }

    return false;
  }

  /**
   * Save execution state to disk
   * @param {Object} executionContext - Execution context
   */
  async saveExecutionState(executionContext) {
    const statePath = path.join(this.executionStateDir, `${executionContext.executionId}.json`);

    const state = {
      executionId: executionContext.executionId,
      workflowId: executionContext.workflowId,
      status: executionContext.status,
      startTime: executionContext.startTime,
      endTime: executionContext.endTime,
      duration: executionContext.duration,
      phaseOutputs: executionContext.phaseOutputs,
      errors: executionContext.errors,
      rollbackExecuted: executionContext.rollbackExecuted
    };

    await fs.writeFile(statePath, JSON.stringify(state, null, 2));
  }

  /**
   * Log event to dashboard events log
   * @param {Object} event - Event data
   */
  async logEvent(event) {
    const eventLine = JSON.stringify(event) + '\n';
    await fs.appendFile(this.eventsLog, eventLine);
    this.emit('event', event);
  }

  /**
   * Generate unique execution ID
   * @param {string} workflowId - Workflow ID
   * @returns {string} Execution ID
   */
  generateExecutionId(workflowId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${workflowId}-${timestamp}-${random}`;
  }

  /**
   * Get active executions
   * @returns {Array} Active executions
   */
  getActiveExecutions() {
    return Array.from(this.activeExecutions.values()).map(ctx => ({
      executionId: ctx.executionId,
      workflowId: ctx.workflowId,
      status: ctx.status,
      currentPhase: ctx.currentPhase,
      startTime: ctx.startTime
    }));
  }

  /**
   * Get execution state
   * @param {string} executionId - Execution ID
   * @returns {Object} Execution state
   */
  async getExecutionState(executionId) {
    const statePath = path.join(this.executionStateDir, `${executionId}.json`);

    try {
      const content = await fs.readFile(statePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }
}

module.exports = WorkflowExecutor;
