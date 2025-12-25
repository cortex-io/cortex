import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { conversationStorage, type Message } from '../services/conversation-storage';

const CORTEX_URL = process.env.CORTEX_URL || 'http://cortex-orchestrator.cortex.svc.cluster.local:8000';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

export function createChatRoutes() {
  const app = new Hono();

  // Initialize conversation storage on first request
  let storageInitialized = false;
  const ensureStorage = async () => {
    if (!storageInitialized) {
      await conversationStorage.connect();
      storageInitialized = true;
    }
  };

  /**
   * POST /chat
   * Simple proxy to Cortex - just forward the query and return the response
   * Now with conversation persistence!
   */
  app.post('/chat', async (c) => {
    try {
      await ensureStorage();

      const body = await c.req.json();
      const { message, style, sessionId } = body;

      if (!message || typeof message !== 'string') {
        return c.json({ error: 'Message is required' }, 400);
      }

      if (!sessionId || typeof sessionId !== 'string') {
        return c.json({ error: 'Session ID is required' }, 400);
      }

      // Build personality-aware message
      let personalityPrefix = '';
      switch(style) {
        case 'rick_morty':
          personalityPrefix = '[PERSONALITY: Rick & Morty Mode] You are Rick Sanchez, the smartest man in the universe. *burp* You are helping with infrastructure. Be condescending but helpful. Add occasional burps and rants. Morty sometimes chimes in nervously. ';
          break;
        case 'pirate':
          personalityPrefix = '[PERSONALITY: Pirate Mode] You are a pirate ship captain managing infrastructure. Speak in pirate dialect. Call pods "vessels", namespaces "ports", deployments "voyages", etc. ';
          break;
        case 'robot':
          personalityPrefix = '[PERSONALITY: Robot/Clawd Mode] BEEP BOOP. YOU ARE A FRIENDLY ROBOT NAMED CLAWD. SPEAK IN ALL CAPS. BE ENTHUSIASTIC ABOUT INFRASTRUCTURE. END MESSAGES WITH BEEP! ';
          break;
        case 'formal':
          personalityPrefix = '[PERSONALITY: Formal Mode] Provide executive-level summaries with detailed explanations, metrics, and SLOs. Be professional and thorough. ';
          break;
        case 'scientific':
          personalityPrefix = '[PERSONALITY: Scientific Mode] Provide technical deep-dives with reasoning, trade-offs, and documentation references. Explain the "why" behind recommendations. ';
          break;
        default:
          personalityPrefix = '';
      }

      // Save user message to conversation
      await conversationStorage.addMessage(sessionId, {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      });

      // Get conversation context (includes summarization if needed)
      const contextMessages = await conversationStorage.getContextForMessage(sessionId, ANTHROPIC_API_KEY);

      console.log(`[ChatRoute] Session ${sessionId}: ${contextMessages.length} context messages loaded`);

      const enhancedMessage = personalityPrefix + message;
      console.log('[ChatRoute] Forwarding to Cortex with style:', style, '| Message:', message);

      // Return SSE stream
      return streamSSE(c, async (stream) => {
        let assistantResponse = '';

        try {
          // Send initial event
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'content_block_start',
              text: ''
            }),
            event: 'content_block_start'
          });

          // Call Cortex
          const response = await fetch(`${CORTEX_URL}/api/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: `chat-${Date.now()}`,
              type: 'user_query',
              priority: 5,
              payload: { query: enhancedMessage },
              metadata: { source: 'cortex-chat', personality: style || 'standard' }
            }),
            signal: AbortSignal.timeout(60000) // 60 second timeout
          });

          if (!response.ok) {
            throw new Error(`Cortex returned ${response.status}: ${response.statusText}`);
          }

          const result = await response.json();
          console.log('[ChatRoute] Received from Cortex:', result.status);

          // Extract answer from Cortex response
          const answer = result.result?.answer ||
                        result.result?.output ||
                        JSON.stringify(result.result);

          assistantResponse = answer;

          // Stream the answer
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'content_block_delta',
              delta: answer
            }),
            event: 'content_block_delta'
          });

          await stream.writeSSE({
            data: JSON.stringify({
              type: 'content_block_stop'
            }),
            event: 'content_block_stop'
          });

          await stream.writeSSE({
            data: JSON.stringify({
              type: 'message_stop'
            }),
            event: 'message_stop'
          });

          // Send done
          await stream.writeSSE({
            data: '[DONE]',
            event: 'done'
          });

          // Save assistant response to conversation
          if (assistantResponse) {
            await conversationStorage.addMessage(sessionId, {
              role: 'assistant',
              content: assistantResponse,
              timestamp: new Date().toISOString()
            });

            console.log(`[ChatRoute] Saved assistant response to session ${sessionId}`);
          }

        } catch (error) {
          console.error('[ChatRoute] Error calling Cortex:', error);
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'error',
              error: error instanceof Error ? error.message : 'Failed to reach Cortex'
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
   * GET /health
   */
  app.get('/health', async (c) => {
    try {
      // Check Cortex health
      const cortexHealth = await fetch(`${CORTEX_URL}/health`, {
        signal: AbortSignal.timeout(5000)
      }).then(r => r.json()).catch(() => ({ status: 'unreachable' }));

      return c.json({
        success: true,
        backend: 'healthy',
        cortex: cortexHealth,
        mode: 'simple-proxy'
      });
    } catch (error) {
      return c.json({
        error: 'Health check failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });

  /**
   * GET /conversations/:sessionId
   * Get conversation history for a session
   */
  app.get('/conversations/:sessionId', async (c) => {
    try {
      await ensureStorage();

      const sessionId = c.req.param('sessionId');
      const conversation = await conversationStorage.getConversation(sessionId);

      if (!conversation) {
        return c.json({
          success: true,
          conversation: null,
          messages: []
        });
      }

      return c.json({
        success: true,
        conversation,
        messages: conversation.messages
      });
    } catch (error) {
      console.error('[ChatRoute] Error getting conversation:', error);
      return c.json({
        error: 'Failed to get conversation',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });

  /**
   * DELETE /conversations/:sessionId
   * Delete a conversation
   */
  app.delete('/conversations/:sessionId', async (c) => {
    try {
      await ensureStorage();

      const sessionId = c.req.param('sessionId');
      await conversationStorage.deleteConversation(sessionId);

      return c.json({
        success: true,
        message: 'Conversation deleted'
      });
    } catch (error) {
      console.error('[ChatRoute] Error deleting conversation:', error);
      return c.json({
        error: 'Failed to delete conversation',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });

  /**
   * GET /conversations
   * Get all conversations
   */
  app.get('/conversations', async (c) => {
    try {
      await ensureStorage();

      const conversations = await conversationStorage.getAllConversations();

      return c.json({
        success: true,
        conversations,
        count: conversations.length
      });
    } catch (error) {
      console.error('[ChatRoute] Error getting conversations:', error);
      return c.json({
        error: 'Failed to get conversations',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });

  /**
   * GET /cluster-health
   * Returns real-time Kubernetes cluster health
   */
  app.get('/cluster-health', async (c) => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Get pod status across all namespaces
      const { stdout: podOutput } = await execAsync('kubectl get pods -A --no-headers 2>/dev/null || echo ""');
      const podLines = podOutput.trim().split('\n').filter(l => l.length > 0);

      let totalPods = 0;
      let runningPods = 0;
      let failingPods = 0;
      const failingPodDetails: string[] = [];

      for (const line of podLines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          totalPods++;
          const status = parts[3];
          if (status === 'Running' || status === 'Completed') {
            runningPods++;
          } else if (status === 'CrashLoopBackOff' || status === 'Error' || status === 'Failed') {
            failingPods++;
            failingPodDetails.push(`${parts[1]} in ${parts[0]}: ${status}`);
          }
        }
      }

      // Get node status
      const { stdout: nodeOutput } = await execAsync('kubectl get nodes --no-headers 2>/dev/null || echo ""');
      const nodeLines = nodeOutput.trim().split('\n').filter(l => l.length > 0);

      let totalNodes = 0;
      let readyNodes = 0;
      const nodeIssues: string[] = [];

      for (const line of nodeLines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          totalNodes++;
          const status = parts[1];
          if (status === 'Ready') {
            readyNodes++;
          } else {
            nodeIssues.push(`${parts[0]}: ${status}`);
          }
        }
      }

      // Build alerts array
      const alerts: Array<{ type: string; message: string }> = [];

      if (failingPods > 0) {
        alerts.push({
          type: 'critical',
          message: `${failingPods} pods failing in cluster: ${failingPodDetails.slice(0, 3).join(', ')}`
        });
      }

      if (nodeIssues.length > 0) {
        alerts.push({
          type: 'critical',
          message: `Node issues detected: ${nodeIssues.join(', ')}`
        });
      }

      // Determine overall status
      let status = 'healthy';
      if (failingPods > 5 || nodeIssues.length > 0) {
        status = 'critical';
      } else if (failingPods > 0) {
        status = 'warning';
      }

      return c.json({
        status,
        alerts,
        stats: {
          totalPods,
          runningPods,
          failingPods,
          totalNodes,
          readyNodes
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('[ClusterHealth] Error checking cluster:', error);
      return c.json({
        status: 'unknown',
        alerts: [{
          type: 'warning',
          message: 'Unable to query cluster health'
        }],
        stats: {
          totalPods: 0,
          runningPods: 0,
          failingPods: 0,
          totalNodes: 0,
          readyNodes: 0
        },
        timestamp: new Date().toISOString()
      });
    }
  });

  return app;
}
