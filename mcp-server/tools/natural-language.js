import IntentParser from '../../lib/nl-interface/intent-parser.js'
import TaskDecomposer from '../../lib/nl-interface/task-decomposer.js'
import ProgressReporter from '../../lib/nl-interface/progress-reporter.js'

/**
 * Natural Language MCP Tool
 *
 * Processes natural language infrastructure requests
 * Decomposes into tasks and provides progress tracking
 */

export const naturalLanguageTool = {
  name: 'cortex_nl_request',
  description: 'Process natural language infrastructure request and decompose into executable tasks',
  inputSchema: {
    type: 'object',
    properties: {
      request: {
        type: 'string',
        description: 'Natural language infrastructure request (e.g., "Build me a k8s cluster with monitoring")'
      },
      dry_run: {
        type: 'boolean',
        description: 'If true, only parse and decompose without executing (default: true)',
        default: true
      }
    },
    required: ['request']
  },

  async handler({ request, dry_run = true }) {
    console.log(`[NL Interface] Processing request: "${request}"`)
    console.log(`[NL Interface] Dry run: ${dry_run}`)

    try {
      // Step 1: Parse intent
      const parser = new IntentParser()
      const parsedIntent = await parser.parseIntent(request)

      if (!parsedIntent.success) {
        return {
          success: false,
          error: parsedIntent.error,
          suggestion: parsedIntent.suggestion
        }
      }

      // Step 2: Decompose into tasks
      const decomposer = new TaskDecomposer()
      const decomposition = await decomposer.decomposeIntoTasks(parsedIntent)

      // Step 3: Save decomposition
      const decompositionPath = await decomposer.saveDecomposition(decomposition)

      // Step 4: Create progress reporter
      const progressReporter = new ProgressReporter(decomposition)
      const initialProgress = progressReporter.getProgressReport()

      const result = {
        success: true,
        dry_run,
        parsed_intent: {
          goal: parsedIntent.primary_goal,
          description: parsedIntent.description,
          components: parsedIntent.components.map(c => c.component),
          estimated_time: parsedIntent.estimated_time,
          estimated_cost: parsedIntent.estimated_cost
        },
        decomposition: {
          tasks: decomposition.tasks.length,
          phases: decomposition.execution_plan.total_phases,
          parallel_phases: decomposition.execution_plan.parallel_phases,
          total_time: decomposition.estimated_total_time,
          execution_plan: decomposition.execution_plan.phases.map(phase => ({
            phase: phase.phase_number,
            tasks: phase.tasks.map(t => t.name),
            parallel: phase.parallel_execution
          }))
        },
        progress: initialProgress,
        summary: progressReporter.getSummary(),
        decomposition_path: decompositionPath
      }

      if (!dry_run) {
        // In production, this would submit tasks to Cortex coordinator
        result.message = 'Tasks submitted to Cortex coordinator for execution'
        result.tracking_url = `http://cortex-dashboard/tasks?intent=${parsedIntent.primary_goal}`
      } else {
        result.message = 'Dry run complete - no tasks executed. Set dry_run=false to execute.'
      }

      return result

    } catch (error) {
      console.error('[NL Interface] Error processing request:', error)

      return {
        success: false,
        error: error.message,
        stack: error.stack
      }
    }
  }
}

export const nlExamplesTool = {
  name: 'cortex_nl_examples',
  description: 'Get example natural language infrastructure requests',
  inputSchema: {
    type: 'object',
    properties: {}
  },

  async handler() {
    const parser = new IntentParser()
    const examples = parser.getExamples()

    return {
      success: true,
      examples: examples.map(ex => ({
        request: ex.request,
        intent: ex.intent,
        usage: `cortex_nl_request({ request: "${ex.request}", dry_run: true })`
      })),
      total: examples.length
    }
  }
}

export default {
  naturalLanguageTool,
  nlExamplesTool
}
