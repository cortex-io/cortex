/**
 * Tool execution service for Cortex Chat
 * Simplified version that routes to existing Cortex orchestrator
 */

import { askCortex } from './cortex-client';

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTime?: number;
}

/**
 * Execute the cortex_ask tool by routing to Cortex orchestrator
 */
export async function executeTool(
  toolName: string,
  toolInput: any
): Promise<ToolResult> {
  const startTime = Date.now();

  try {
    console.log(`[ToolExecutor] Executing tool: ${toolName}`, toolInput);

    if (toolName === 'cortex_ask') {
      const result = await askCortex(toolInput.request);
      return {
        success: true,
        data: result,
        executionTime: Date.now() - startTime
      };
    }

    return {
      success: false,
      error: `Unknown tool: ${toolName}`,
      executionTime: Date.now() - startTime
    };

  } catch (error) {
    console.error(`[ToolExecutor] Error executing tool ${toolName}:`, error);

    if (error instanceof Error) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime
      };
    }

    return {
      success: false,
      error: 'Unknown error',
      executionTime: Date.now() - startTime
    };
  }
}

/**
 * Format tool result for Claude API
 */
export function formatToolResult(toolUseId: string, result: ToolResult): any {
  if (result.success) {
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: JSON.stringify(result.data, null, 2)
    };
  } else {
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: JSON.stringify({
        error: result.error,
        success: false
      }, null, 2),
      is_error: true
    };
  }
}
