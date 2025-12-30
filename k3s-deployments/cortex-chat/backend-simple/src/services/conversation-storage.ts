import { createClient, RedisClientType } from 'redis';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface Conversation {
  sessionId: string;
  title?: string;
  messages: Message[];
  summary?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  status: 'active' | 'in_progress' | 'completed';
}

export class ConversationStorage {
  private redis: RedisClientType;
  private connected: boolean = false;

  constructor() {
    const redisHost = process.env.REDIS_HOST || 'redis.cortex-system.svc.cluster.local';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379');

    this.redis = createClient({
      socket: {
        host: redisHost,
        port: redisPort,
      }
    });

    this.redis.on('error', (err) => {
      console.error('[ConversationStorage] Redis error:', err);
      this.connected = false;
    });

    this.redis.on('connect', () => {
      console.log('[ConversationStorage] Redis connected');
      this.connected = true;
    });
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.redis.connect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.redis.disconnect();
      this.connected = false;
    }
  }

  private getKey(sessionId: string): string {
    return `conversation:${sessionId}`;
  }

  async getConversation(sessionId: string): Promise<Conversation | null> {
    try {
      const key = this.getKey(sessionId);
      const data = await this.redis.get(key);

      if (!data) {
        return null;
      }

      const conversation = JSON.parse(data) as Conversation;

      // Backward compatibility: set status to 'active' if not present
      if (!conversation.status) {
        conversation.status = 'active';
      }

      return conversation;
    } catch (error) {
      console.error('[ConversationStorage] Error getting conversation:', error);
      return null;
    }
  }

  async saveConversation(conversation: Conversation): Promise<void> {
    try {
      const key = this.getKey(conversation.sessionId);
      conversation.updatedAt = new Date().toISOString();
      conversation.messageCount = conversation.messages.length;

      // Store with 24 hour expiration
      await this.redis.setEx(key, 86400, JSON.stringify(conversation));

      console.log(`[ConversationStorage] Saved conversation ${conversation.sessionId} with ${conversation.messageCount} messages`);
    } catch (error) {
      console.error('[ConversationStorage] Error saving conversation:', error);
      throw error;
    }
  }

  /**
   * Generate a title from the first user message
   */
  private generateTitle(message: string): string {
    // Take first 50 characters or until first newline
    const title = message.split('\n')[0].substring(0, 50).trim();
    return title.length < message.length ? `${title}...` : title;
  }

  async addMessage(sessionId: string, message: Message): Promise<Conversation> {
    try {
      let conversation = await this.getConversation(sessionId);

      if (!conversation) {
        // Create new conversation
        conversation = {
          sessionId,
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 0,
          status: 'active'
        };

        // Auto-generate title from first user message
        if (message.role === 'user') {
          conversation.title = this.generateTitle(message.content);
        }
      } else if (!conversation.title && message.role === 'user' && conversation.messages.length === 0) {
        // Set title if this is the first user message and no title exists
        conversation.title = this.generateTitle(message.content);
      }

      // Ensure status exists for backward compatibility
      if (!conversation.status) {
        conversation.status = 'active';
      }

      // Add message
      conversation.messages.push(message);

      // Save updated conversation
      await this.saveConversation(conversation);

      return conversation;
    } catch (error) {
      console.error('[ConversationStorage] Error adding message:', error);
      throw error;
    }
  }

  async getMessages(sessionId: string): Promise<Message[]> {
    try {
      const conversation = await this.getConversation(sessionId);
      return conversation?.messages || [];
    } catch (error) {
      console.error('[ConversationStorage] Error getting messages:', error);
      return [];
    }
  }

  async deleteConversation(sessionId: string): Promise<void> {
    try {
      const key = this.getKey(sessionId);
      await this.redis.del(key);
      console.log(`[ConversationStorage] Deleted conversation ${sessionId}`);
    } catch (error) {
      console.error('[ConversationStorage] Error deleting conversation:', error);
      throw error;
    }
  }

  async updateConversationStatus(
    sessionId: string,
    status: 'active' | 'in_progress' | 'completed'
  ): Promise<void> {
    try {
      const conversation = await this.getConversation(sessionId);

      if (!conversation) {
        console.warn(`[ConversationStorage] Cannot update status: conversation ${sessionId} not found`);
        return;
      }

      const oldStatus = conversation.status;
      conversation.status = status;
      await this.saveConversation(conversation);

      console.log(`[ConversationStorage] Updated conversation ${sessionId} status: ${oldStatus} -> ${status}`);
    } catch (error) {
      console.error('[ConversationStorage] Error updating conversation status:', error);
      throw error;
    }
  }

  async summarizeConversation(sessionId: string, apiKey: string): Promise<string> {
    try {
      const conversation = await this.getConversation(sessionId);

      if (!conversation || conversation.messages.length === 0) {
        return '';
      }

      // If already summarized recently and not too many new messages, return existing summary
      if (conversation.summary && conversation.messages.length < 20) {
        return conversation.summary;
      }

      // Build conversation text for summarization
      const conversationText = conversation.messages
        .slice(0, -5) // Don't summarize the last 5 messages - keep them as context
        .map(m => `${m.role}: ${m.content}`)
        .join('\n\n');

      if (!conversationText) {
        return '';
      }

      // Call Claude API to summarize
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: `Summarize this conversation in a concise paragraph that captures the key topics, questions, and outcomes. This summary will be used as context for continuing the conversation:\n\n${conversationText}`
          }]
        })
      });

      if (!response.ok) {
        console.error('[ConversationStorage] Failed to summarize:', await response.text());
        return conversation.summary || '';
      }

      const result = await response.json();
      const summary = result.content?.[0]?.text || '';

      // Update conversation with summary
      conversation.summary = summary;
      await this.saveConversation(conversation);

      console.log(`[ConversationStorage] Generated summary for ${sessionId}: ${summary.substring(0, 100)}...`);

      return summary;
    } catch (error) {
      console.error('[ConversationStorage] Error summarizing conversation:', error);
      return '';
    }
  }

  async getContextForMessage(sessionId: string, apiKey: string): Promise<Message[]> {
    try {
      const conversation = await this.getConversation(sessionId);

      if (!conversation || conversation.messages.length === 0) {
        return [];
      }

      // If conversation is short (15 messages or less), return all messages
      if (conversation.messages.length <= 15) {
        return conversation.messages;
      }

      // For longer conversations, summarize old messages and keep recent ones
      const summary = await this.summarizeConversation(sessionId, apiKey);
      const recentMessages = conversation.messages.slice(-10); // Keep last 10 messages

      // Prepend summary as a system-like message
      const contextMessages: Message[] = [];

      if (summary) {
        contextMessages.push({
          role: 'assistant',
          content: `[Previous conversation summary: ${summary}]`,
          timestamp: conversation.createdAt
        });
      }

      contextMessages.push(...recentMessages);

      return contextMessages;
    } catch (error) {
      console.error('[ConversationStorage] Error getting context:', error);
      return [];
    }
  }

  async getAllConversations(): Promise<Conversation[]> {
    try {
      const keys = await this.redis.keys('conversation:*');
      const conversations: Conversation[] = [];

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const conversation = JSON.parse(data) as Conversation;

          // Backward compatibility: set status to 'active' if not present
          if (!conversation.status) {
            conversation.status = 'active';
          }

          conversations.push(conversation);
        }
      }

      // Sort by updatedAt descending
      conversations.sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      return conversations;
    } catch (error) {
      console.error('[ConversationStorage] Error getting all conversations:', error);
      return [];
    }
  }

  async getGroupedConversations(): Promise<{
    active: Conversation[];
    in_progress: Conversation[];
    completed: Conversation[];
  }> {
    try {
      const allConversations = await this.getAllConversations();

      const grouped = {
        active: allConversations.filter(c => c.status === 'active'),
        in_progress: allConversations.filter(c => c.status === 'in_progress'),
        completed: allConversations.filter(c => c.status === 'completed')
      };

      return grouped;
    } catch (error) {
      console.error('[ConversationStorage] Error getting grouped conversations:', error);
      return {
        active: [],
        in_progress: [],
        completed: []
      };
    }
  }
}

// Export singleton instance
export const conversationStorage = new ConversationStorage();
