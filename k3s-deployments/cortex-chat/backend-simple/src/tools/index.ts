import { Tool } from '@anthropic-ai/sdk/resources/messages.mjs';
import { cortexTool } from './cortex-tool';

/**
 * Tool definitions for Cortex Chat
 * Simplified to just route to existing Cortex orchestrator
 */
export const tools: Tool[] = [
  cortexTool
];

/**
 * Get tool by name
 */
export function getToolByName(name: string): Tool | undefined {
  return tools.find(tool => tool.name === name);
}
