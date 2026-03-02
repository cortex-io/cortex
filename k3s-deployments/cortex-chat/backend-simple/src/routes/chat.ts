import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { ClaudeService } from '../services/claude';
import type { ChatMessage } from '../services/claude';
import { tools } from '../tools';

export function createChatRoutes(claudeService: ClaudeService) {
  const app = new Hono();

  /**
   * POST /chat
   * Main chat endpoint with SSE streaming and tool execution
   */
  app.post('/chat', async (c) => {
    try {
      const body = await c.req.json();
      const { message, history } = body;

      if (!message || typeof message !== 'string') {
        return c.json({ error: 'Message is required' }, 400);
      }

      console.log('[ChatRoute] Received chat request');

      // Return SSE stream
      return streamSSE(c, async (stream) => {
        try {
          // Process message with Claude and tool execution
          const eventStream = claudeService.processMessage(
            message,
            (history as ChatMessage[]) || []
          );

          for await (const event of eventStream) {
            // Send event to client
            await stream.writeSSE({
              data: JSON.stringify(event),
              event: event.type
            });
          }

          // Send final done event
          await stream.writeSSE({
            data: '[DONE]',
            event: 'done'
          });

        } catch (error) {
          console.error('[ChatRoute] Error in SSE stream:', error);
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'error',
              error: error instanceof Error ? error.message : 'Unknown error'
            }),
            event: 'error'
          });
        }
      });

    } catch (error) {
      console.error('[ChatRoute] Error in chat endpoint:', error);
      return c.json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });

  /**
   * GET /tools
   * Get available tools
   */
  app.get('/tools', (c) => {
    try {
      return c.json({
        success: true,
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.input_schema
        }))
      });
    } catch (error) {
      console.error('[ChatRoute] Error getting tools:', error);
      return c.json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });

  /**
   * GET /health
   * Health check including MCP server status
   */
  app.get('/health', async (c) => {
    try {

      return c.json({
        success: true,
        backend: 'healthy',
        claude: 'initialized',
        mcpServers: {},
        toolCount: tools.length
      });
    } catch (error) {
      console.error('[ChatRoute] Error in health check:', error);
      return c.json({
        error: 'Health check failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });

  return app;
}
