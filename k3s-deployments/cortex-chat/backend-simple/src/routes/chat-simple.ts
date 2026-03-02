import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { conversationStorage, type Message } from '../services/conversation-storage';
import { issueDetector, type DetectedIssue } from '../services/issue-detector';
import { contextAnalyzer, type ContextualSuggestion } from '../services/context-analyzer';
import { detectYouTubeURLs } from '../services/youtube-detector';
import { startVideoProcessing, handleImplementationApproval } from '../services/youtube-workflow';

const CORTEX_URL = process.env.CORTEX_URL || 'http://cortex-orchestrator.cortex.svc.cluster.local:8000';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

/**
 * Strip all emojis and visual indicators from text
 */
function stripEmojis(text: string): string {
  // Remove emojis, symbols, pictographs, colored circles, and other visual indicators
  return text
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // Misc Symbols and Pictographs
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport and Map
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '') // Flags
    .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Misc symbols (including colored circles)
    .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Supplemental Symbols and Pictographs
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '') // Symbols and Pictographs Extended-A
    .replace(/[\u{25A0}-\u{25FF}]/gu, '')   // Geometric shapes (squares, circles, triangles)
    .replace(/[\u{2B00}-\u{2BFF}]/gu, '')   // Misc Symbols and Arrows
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')   // Variation Selectors
    .replace(/[\u{1F004}]/gu, '')           // Mahjong Tile Red Dragon
    .replace(/[\u{1F0CF}]/gu, '');          // Playing Card Black Joker
}

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
      const { message, style, sessionId, isAction } = body;

      if (!message || typeof message !== 'string') {
        return c.json({ error: 'Message is required' }, 400);
      }

      if (!sessionId || typeof sessionId !== 'string') {
        return c.json({ error: 'Session ID is required' }, 400);
      }

      // If this is an action (fix/investigate/auto-continue), update status to in_progress
      if (isAction === true) {
        await conversationStorage.updateConversationStatus(sessionId, 'in_progress');
      }

      // Check for yes/no/details responses to YouTube analysis
      const lowerMessage = message.toLowerCase().trim();
      const isYouTubeResponse = lowerMessage === 'yes' || lowerMessage === 'no' || lowerMessage === 'details';

      // Get recent messages to check if this is a response to YouTube analysis
      const recentMessages = await conversationStorage.getMessages(sessionId);
      const lastAnalysis = recentMessages.reverse().find(m =>
        m.metadata?.type === 'youtube_analysis' &&
        m.metadata?.requiresApproval === true
      );

      if (isYouTubeResponse && lastAnalysis) {
        // Handle YouTube implementation approval
        const videoId = lastAnalysis.metadata?.videoId;

        if (lowerMessage === 'yes') {
          await handleImplementationApproval(sessionId, videoId, true);
          return c.json({ message: 'Implementation started' });
        } else if (lowerMessage === 'no') {
          await handleImplementationApproval(sessionId, videoId, false);
          return c.json({ message: 'Implementation cancelled' });
        } else if (lowerMessage === 'details') {
          const analysis = lastAnalysis.metadata?.analysis;
          const detailsMessage = formatDetailedAnalysis(analysis);

          await conversationStorage.addMessage(sessionId, {
            role: 'assistant',
            content: detailsMessage,
            timestamp: new Date().toISOString()
          });

          // Return SSE stream and trigger frontend reload
          return streamSSE(c, async (stream) => {
            await stream.writeSSE({
              data: JSON.stringify({
                type: 'details_posted',
                message: 'Detailed analysis posted'
              }),
              event: 'details_posted'
            });

            await stream.writeSSE({
              data: '[DONE]',
              event: 'done'
            });
          });
        }
      }

      // Check for YouTube URLs and trigger workflow
      const youtubeDetection = detectYouTubeURLs(message);

      if (youtubeDetection.detected) {
        console.log(`[ChatRoute] Detected ${youtubeDetection.videoIds.length} YouTube video(s), starting workflow...`);

        // Save user message first
        await conversationStorage.addMessage(sessionId, {
          role: 'user',
          content: message,
          timestamp: new Date().toISOString()
        });

        // Start workflow for each video (parallel processing)
        for (const videoId of youtubeDetection.videoIds) {
          const videoUrl = youtubeDetection.urls.find(url => url.includes(videoId)) || '';
          startVideoProcessing(sessionId, videoUrl, videoId).catch(error => {
            console.error(`[ChatRoute] Workflow failed for ${videoId}:`, error);
          });
        }

        // Return SSE stream with notification to reload conversation
        return streamSSE(c, async (stream) => {
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'youtube_processing',
              message: 'YouTube video processing started in background'
            }),
            event: 'youtube_processing'
          });

          await stream.writeSSE({
            data: '[DONE]',
            event: 'done'
          });
        });
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

      // Use message as-is - let orchestrator handle tone (technical by default)
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

          // Strip timestamps from context messages (Claude API doesn't allow extra fields)
          const cleanedHistory = contextMessages.map(msg => ({
            role: msg.role,
            content: msg.content
          }));

          // Call Cortex orchestrator's new /api/chat endpoint
          const response = await fetch(`${CORTEX_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: message,
              sessionId: sessionId,
              history: cleanedHistory
            }),
            signal: AbortSignal.timeout(300000) // 300 second (5 minute) timeout
          });

          if (!response.ok) {
            throw new Error(`Cortex returned ${response.status}: ${response.statusText}`);
          }

          // Parse SSE stream from Cortex
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let fullAnswer = '';

          if (!reader) {
            throw new Error('No response body from Cortex');
          }

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const jsonData = line.substring(6);
                  const event = JSON.parse(jsonData);

                  // Handle different event types from new /api/chat endpoint
                  if (event.type === 'content_block_delta' && event.delta?.text) {
                    fullAnswer += event.delta.text;
                  } else if (event.type === 'error') {
                    throw new Error(event.error || 'Unknown error from Cortex');
                  }
                  // Ignore other events: processing_start, tool_progress, tool_execution, message_stop
                } catch (e) {
                  // Skip malformed data lines
                  console.log('[ChatRoute] Failed to parse SSE event:', e);
                }
              }
            }
          }

          if (!fullAnswer || fullAnswer.trim().length === 0) {
            throw new Error('No content received from Cortex');
          }

          // Strip all emojis from response
          const answer = stripEmojis(fullAnswer);

          // Detect issues in the response
          console.log(`[ChatRoute] DEBUG: Full response length:`, answer.length);
          console.log(`[ChatRoute] DEBUG: Response contains "Issues":`, answer.includes('Issues'));
          console.log(`[ChatRoute] DEBUG: Response contains "ContainerCreating":`, answer.includes('ContainerCreating'));
          const detectedIssues = issueDetector.detectIssues(answer);
          console.log(`[ChatRoute] Detected ${detectedIssues.length} issues`);
          if (detectedIssues.length > 0) {
            console.log(`[ChatRoute] Issues found:`, detectedIssues.map(i => i.title));
          }

          // Build enhanced response with issue detection
          let enhancedAnswer = answer;
          if (detectedIssues.length > 0) {
            const issuesMarkdown = issueDetector.formatIssuesAsMarkdown(detectedIssues);
            enhancedAnswer = answer + issuesMarkdown;
          }

          assistantResponse = enhancedAnswer;

          // Stream the answer
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'content_block_delta',
              delta: enhancedAnswer
            }),
            event: 'content_block_delta'
          });

          // If issues were detected, send them as separate events for UI to handle
          if (detectedIssues.length > 0) {
            await stream.writeSSE({
              data: JSON.stringify({
                type: 'issues_detected',
                issues: detectedIssues
              }),
              event: 'issues_detected'
            });
          }

          await stream.writeSSE({
            data: JSON.stringify({
              type: 'content_block_stop'
            }),
            event: 'content_block_stop'
          });

          // Only send contextual suggestions if NO issues were detected
          // When issues exist, user should see FIX buttons instead of value-adds
          if (detectedIssues.length === 0) {
            const suggestions = contextAnalyzer.analyzeSuggestions(message, enhancedAnswer);

            // Send suggestions if any were generated
            if (suggestions.length > 0) {
              await stream.writeSSE({
                data: JSON.stringify({
                  type: 'suggestions',
                  suggestions: suggestions
                }),
                event: 'suggestions'
              });
              console.log(`[ChatRoute] Generated ${suggestions.length} contextual suggestions`);
            }
          } else {
            console.log(`[ChatRoute] Skipping suggestions - ${detectedIssues.length} issues detected, showing fix buttons instead`);
          }

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

            // Update conversation status to 'completed' after Cortex response
            await conversationStorage.updateConversationStatus(sessionId, 'completed');
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
   * PATCH /conversations/:sessionId/status
   * Update conversation status
   */
  app.patch('/conversations/:sessionId/status', async (c) => {
    try {
      await ensureStorage();

      const sessionId = c.req.param('sessionId');
      const body = await c.req.json();
      const { status } = body;

      if (!status || !['active', 'in_progress', 'completed'].includes(status)) {
        return c.json({
          error: 'Invalid status. Must be one of: active, in_progress, completed'
        }, 400);
      }

      await conversationStorage.updateConversationStatus(sessionId, status);

      return c.json({
        success: true,
        message: `Conversation status updated to ${status}`
      });
    } catch (error) {
      console.error('[ChatRoute] Error updating conversation status:', error);
      return c.json({
        error: 'Failed to update conversation status',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });

  /**
   * GET /conversations
   * Get all conversations grouped by status
   */
  app.get('/conversations', async (c) => {
    try {
      await ensureStorage();

      const grouped = await conversationStorage.getGroupedConversations();

      return c.json({
        success: true,
        conversations: grouped,
        counts: {
          active: grouped.active.length,
          in_progress: grouped.in_progress.length,
          completed: grouped.completed.length
        }
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

/**
 * Format detailed analysis for user review
 */
function formatDetailedAnalysis(analysis: any): string {
  if (!analysis) {
    return 'ERROR: Analysis data not found';
  }

  const { summary, relevance, improvements } = analysis;

  let message = `**Detailed Analysis**\n\n`;
  message += `**Video Summary:**\n${summary}\n\n`;
  message += `**Relevance to Cortex:** ${Math.floor(relevance * 100)}%\n\n`;
  message += `**Recommended Improvements:**\n\n`;

  improvements.forEach((imp: any, idx: number) => {
    const priorityLabel = imp.priority === 'high' ? '[HIGH]' : imp.priority === 'medium' ? '[MED]' : '[LOW]';
    message += `**${idx + 1}. ${priorityLabel} ${imp.title}**\n`;
    message += `${imp.description}\n\n`;
  });

  message += `**Would you like me to implement these improvements?**\n\n`;
  message += `Reply with:\n`;
  message += `- **"yes"** to implement all improvements\n`;
  message += `- **"no"** to skip implementation`;

  return message;
}
