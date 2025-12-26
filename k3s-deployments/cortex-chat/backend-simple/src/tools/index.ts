import { Tool } from '@anthropic-ai/sdk/resources/messages.mjs';
import { cortexTool, cortexCreateTaskTool, cortexGetTaskStatusTool } from './cortex-tool';

/**
 * Tool definitions for Cortex Chat
 * Includes parallel task creation and status checking
 */
export const tools: Tool[] = [
  cortexTool,
  cortexCreateTaskTool,
  cortexGetTaskStatusTool
];

/**
 * Get tool by name
 */
export function getToolByName(name: string): Tool | undefined {
  return tools.find(tool => tool.name === name);
}
