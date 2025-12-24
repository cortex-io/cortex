import Anthropic from '@anthropic-ai/sdk';
import { tools } from '../tools';
import { executeTool, formatToolResult } from './tool-executor';

/**
 * Message in conversation history
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Streaming event types
 */
export type StreamEvent =
  | { type: 'content_block_start'; text: string }
  | { type: 'content_block_delta'; delta: string }
  | { type: 'content_block_stop' }
  | { type: 'tool_use_start'; toolName: string; toolUseId: string }
  | { type: 'tool_use_input'; input: any }
  | { type: 'tool_execution_start'; toolName: string }
  | { type: 'tool_execution_complete'; toolName: string; result: any }
  | { type: 'tool_execution_error'; toolName: string; error: string }
  | { type: 'message_stop' }
  | { type: 'error'; error: string };

/**
 * Claude service for handling chat interactions with tool use
 */
export class ClaudeService {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(apiKey: string, model: string = 'claude-sonnet-4-5-20250929', maxTokens: number = 4096) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.maxTokens = maxTokens;
  }

  /**
   * Process a chat message with tool execution support
   * Handles the full conversation loop including tool use rounds
   */
  async *processMessage(
    userMessage: string,
    conversationHistory: ChatMessage[] = []
  ): AsyncGenerator<StreamEvent> {
    try {
      // Build message history
      const messages: Anthropic.Messages.MessageParam[] = [
        ...conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        {
          role: 'user' as const,
          content: userMessage
        }
      ];

      // Initial request to Claude
      let continueLoop = true;
      let currentMessages = messages;
      let iterationCount = 0;
      const MAX_ITERATIONS = 10; // Prevent infinite loops

      while (continueLoop && iterationCount < MAX_ITERATIONS) {
        iterationCount++;
        console.log(`[ClaudeService] Iteration ${iterationCount}: Sending request to Claude API...`);

        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
          messages: currentMessages,
          tools: tools,
          stream: false // We handle streaming manually for better control
        });

        console.log('[ClaudeService] Received response from Claude');
        console.log('[ClaudeService] Stop reason:', response.stop_reason);
        console.log('[ClaudeService] Content blocks:', response.content.length);

        // Process response content blocks
        const toolResults: any[] = [];
        let hasToolUse = false;

        for (const block of response.content) {
          if (block.type === 'text') {
            // Stream text content
            yield { type: 'content_block_start', text: '' };
            yield { type: 'content_block_delta', delta: block.text };
            yield { type: 'content_block_stop' };
          } else if (block.type === 'tool_use') {
            hasToolUse = true;
            const toolUseBlock = block;

            console.log(`[ClaudeService] Tool use detected: ${toolUseBlock.name}`);

            // Notify frontend that tool use is starting
            yield {
              type: 'tool_use_start',
              toolName: toolUseBlock.name,
              toolUseId: toolUseBlock.id
            };

            yield {
              type: 'tool_use_input',
              input: toolUseBlock.input
            };

            // Execute the tool
            yield {
              type: 'tool_execution_start',
              toolName: toolUseBlock.name
            };

            const result = await executeTool(toolUseBlock.name, toolUseBlock.input);

            if (result.success) {
              console.log(`[ClaudeService] Tool ${toolUseBlock.name} executed successfully`);
              yield {
                type: 'tool_execution_complete',
                toolName: toolUseBlock.name,
                result: result.data
              };
            } else {
              console.error(`[ClaudeService] Tool ${toolUseBlock.name} failed:`, result.error);
              yield {
                type: 'tool_execution_error',
                toolName: toolUseBlock.name,
                error: result.error || 'Unknown error'
              };
            }

            // Format result for Claude
            toolResults.push(formatToolResult(toolUseBlock.id, result));
          }
        }

        // If tools were used, continue the conversation with results
        if (hasToolUse && response.stop_reason === 'tool_use') {
          console.log(`[ClaudeService] Continuing conversation with ${toolResults.length} tool results`);

          // Add assistant message with tool use
          currentMessages = [
            ...currentMessages,
            {
              role: 'assistant' as const,
              content: response.content
            },
            {
              role: 'user' as const,
              content: toolResults
            }
          ];

          // Continue the loop to get Claude's response to the tool results
          continueLoop = true;
        } else {
          // No more tool use, conversation is complete
          continueLoop = false;
        }
      }

      if (iterationCount >= MAX_ITERATIONS) {
        console.warn('[ClaudeService] Max iterations reached, stopping tool execution loop');
        yield {
          type: 'error',
          error: 'Maximum tool execution iterations reached'
        };
      }

      yield { type: 'message_stop' };

    } catch (error) {
      console.error('[ClaudeService] Error processing message:', error);
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Get available tools
   */
  getTools() {
    return tools;
  }
}

/**
 * Create a Claude service instance
 */
export function createClaudeService(
  apiKey: string,
  model?: string,
  maxTokens?: number
): ClaudeService {
  return new ClaudeService(apiKey, model, maxTokens);
}
