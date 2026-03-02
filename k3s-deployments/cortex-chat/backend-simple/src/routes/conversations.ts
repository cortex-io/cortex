import { Hono } from 'hono';
import { createClient } from 'redis';
import { authMiddleware } from '../middleware/auth';

const REDIS_HOST = process.env.REDIS_HOST || 'redis.cortex-chat.svc.cluster.local';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';

export function createConversationRoutes() {
  const app = new Hono();

  // Apply auth middleware to all routes
  app.use('*', authMiddleware);

  // Redis client for conversation storage
  const redisConfig: any = {
    socket: {
      host: REDIS_HOST,
      port: REDIS_PORT
    }
  };

  if (REDIS_PASSWORD) {
    redisConfig.password = REDIS_PASSWORD;
  }

  const redis = createClient(redisConfig);
  redis.connect().catch(console.error);

  /**
   * GET /conversations
   * List all conversations for the authenticated user
   */
  app.get('/', async (c) => {
    try {
      const user = c.get('user');
      if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const conversationKeys = await redis.keys(`conversations:${user.username}:*`);
      const conversations = [];

      for (const key of conversationKeys) {
        const data = await redis.get(key);
        if (data) {
          conversations.push(JSON.parse(data));
        }
      }

      // Sort by updated_at descending
      conversations.sort((a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );

      return c.json({
        success: true,
        conversations
      });
    } catch (error) {
      console.error('[Conversations] Error listing conversations:', error);
      return c.json({
        error: 'Failed to list conversations',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });

  /**
   * GET /conversations/:id
   * Get a specific conversation
   */
  app.get('/:id', async (c) => {
    try {
      const user = c.get('user');
      if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const conversationId = c.req.param('id');
      const key = `conversations:${user.username}:${conversationId}`;
      const data = await redis.get(key);

      if (!data) {
        return c.json({ error: 'Conversation not found' }, 404);
      }

      return c.json({
        success: true,
        conversation: JSON.parse(data)
      });
    } catch (error) {
      console.error('[Conversations] Error getting conversation:', error);
      return c.json({
        error: 'Failed to get conversation',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });

  /**
   * POST /conversations
   * Create or update a conversation
   */
  app.post('/', async (c) => {
    try {
      const user = c.get('user');
      if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const body = await c.req.json();
      const { id, title, messages } = body;

      if (!id || !title || !Array.isArray(messages)) {
        return c.json({
          error: 'Invalid request body. Required: id, title, messages'
        }, 400);
      }

      const conversation = {
        id,
        title,
        messages,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Check if conversation exists
      const key = `conversations:${user.username}:${id}`;
      const existing = await redis.get(key);

      if (existing) {
        const existingConv = JSON.parse(existing);
        conversation.created_at = existingConv.created_at;
      }

      await redis.set(key, JSON.stringify(conversation));

      return c.json({
        success: true,
        conversation
      });
    } catch (error) {
      console.error('[Conversations] Error saving conversation:', error);
      return c.json({
        error: 'Failed to save conversation',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });

  /**
   * DELETE /conversations/:id
   * Delete a conversation
   */
  app.delete('/:id', async (c) => {
    try {
      const user = c.get('user');
      if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const conversationId = c.req.param('id');
      const key = `conversations:${user.username}:${conversationId}`;

      const deleted = await redis.del(key);

      if (deleted === 0) {
        return c.json({ error: 'Conversation not found' }, 404);
      }

      return c.json({
        success: true,
        message: 'Conversation deleted'
      });
    } catch (error) {
      console.error('[Conversations] Error deleting conversation:', error);
      return c.json({
        error: 'Failed to delete conversation',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });

  return app;
}
