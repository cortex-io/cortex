/**
 * Security Tests for Authentication and Authorization
 * 
 * These tests verify that the pentest finding "Unauthenticated access to and mutation 
 * of conversations by caller-supplied session ID" has been properly mitigated.
 * 
 * The tests cover:
 * 1. Authentication enforcement on all chat endpoints
 * 2. Session ownership validation
 * 3. Prevention of cross-user conversation access
 * 4. Prevention of unauthorized conversation mutation
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'bun:test';
import { Hono } from 'hono';
import { createChatRoutes } from '../routes/chat-simple';
import { conversationStorage } from '../services/conversation-storage';
import { sign } from 'hono/jwt';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

// Helper function to create a valid JWT token
async function createToken(username) {
  const payload = {
    username,
    sub: username,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
  };
  return await sign(payload, JWT_SECRET);
}

// Helper function to create a test conversation
async function createTestConversation(sessionId, userId) {
  const conversation = {
    sessionId,
    userId,
    title: 'Test Conversation',
    messages: [
      {
        role: 'user',
        content: 'Hello',
        timestamp: new Date().toISOString()
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 1,
    status: 'active'
  };
  
  await conversationStorage.saveConversation(conversation);
  return conversation;
}

// Mock fetch for Cortex API calls
const originalFetch = global.fetch;
function mockFetch() {
  global.fetch = async (url, init) => {
    return new Response(JSON.stringify({ response: 'Mocked response' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
}

function restoreFetch() {
  global.fetch = originalFetch;
}

describe('Authentication and Authorization Security Tests', () => {
  let app;
  
  beforeAll(async () => {
    // Initialize storage
    await conversationStorage.connect();
    mockFetch();
  });

  beforeEach(() => {
    // Create a fresh app instance for each test
    app = new Hono();
    const chatRoutes = createChatRoutes();
    app.route('/api', chatRoutes);
  });

  afterAll(async () => {
    await conversationStorage.disconnect();
    restoreFetch();
  });

  describe('POST /api/chat - Authentication Enforcement', () => {
    test('should reject requests without Authorization header', async () => {
      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: 'Test message',
          sessionId: 'test-session-1'
        })
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(401);
      
      const body = await res.json();
      expect(body.error).toBe('Authentication required');
    });

    test('should reject requests with invalid Authorization format', async () => {
      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'InvalidFormat token123'
        },
        body: JSON.stringify({
          message: 'Test message',
          sessionId: 'test-session-2'
        })
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(401);
      
      const body = await res.json();
      expect(body.error).toBe('Invalid authentication format');
    });

    test('should reject requests with invalid JWT token', async () => {
      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer invalid.jwt.token'
        },
        body: JSON.stringify({
          message: 'Test message',
          sessionId: 'test-session-3'
        })
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(401);
      
      const body = await res.json();
      expect(body.error).toBe('Invalid token');
    });

    test('should accept requests with valid JWT token for new conversation', async () => {
      const token = await createToken('alice');
      const sessionId = `session-${Date.now()}`;
      
      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: 'Test message',
          sessionId
        })
      });

      const res = await app.fetch(req);
      // Should not be 401 or 403 (authentication/authorization errors)
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  describe('POST /api/chat - Session Ownership Validation', () => {
    test('should prevent user from accessing another user\'s conversation', async () => {
      // Create a conversation owned by alice
      const sessionId = `session-${Date.now()}-alice`;
      await createTestConversation(sessionId, 'alice');

      // Try to access it as bob
      const bobToken = await createToken('bob');
      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bobToken}`
        },
        body: JSON.stringify({
          message: 'Trying to access Alice\'s conversation',
          sessionId
        })
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(403);
      
      const body = await res.json();
      expect(body.error).toBe('Unauthorized access to conversation');
    });

    test('should allow user to access their own conversation', async () => {
      // Create a conversation owned by alice
      const sessionId = `session-${Date.now()}-alice-own`;
      await createTestConversation(sessionId, 'alice');

      // Access it as alice
      const aliceToken = await createToken('alice');
      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        },
        body: JSON.stringify({
          message: 'Accessing my own conversation',
          sessionId
        })
      });

      const res = await app.fetch(req);
      // Should not be 403 (authorization error)
      expect(res.status).not.toBe(403);
    });

    test('should prevent predictable session ID exploitation', async () => {
      // Simulate the timestamp-based ID pattern from the pentest finding
      const timestamp = Date.now();
      const predictableSessionId = `session-${timestamp}`;
      
      // Alice creates a conversation with predictable ID
      await createTestConversation(predictableSessionId, 'alice');

      // Bob tries to guess and access it
      const bobToken = await createToken('bob');
      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bobToken}`
        },
        body: JSON.stringify({
          message: 'Trying to exploit predictable ID',
          sessionId: predictableSessionId
        })
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(403);
      
      const body = await res.json();
      expect(body.error).toBe('Unauthorized access to conversation');
    });
  });

  describe('GET /api/conversations/:sessionId - Read Authorization', () => {
    test('should reject unauthenticated read requests', async () => {
      const sessionId = `session-${Date.now()}-read-test`;
      
      const req = new Request(`http://localhost/api/conversations/${sessionId}`, {
        method: 'GET'
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(401);
      
      const body = await res.json();
      expect(body.error).toBe('Authentication required');
    });

    test('should prevent cross-user conversation read', async () => {
      // Create a conversation owned by alice
      const sessionId = `session-${Date.now()}-read-alice`;
      await createTestConversation(sessionId, 'alice');

      // Try to read it as bob
      const bobToken = await createToken('bob');
      const req = new Request(`http://localhost/api/conversations/${sessionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${bobToken}`
        }
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(403);
      
      const body = await res.json();
      expect(body.error).toBe('Unauthorized access to conversation');
    });

    test('should allow user to read their own conversation', async () => {
      // Create a conversation owned by alice
      const sessionId = `session-${Date.now()}-read-alice-own`;
      await createTestConversation(sessionId, 'alice');

      // Read it as alice
      const aliceToken = await createToken('alice');
      const req = new Request(`http://localhost/api/conversations/${sessionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${aliceToken}`
        }
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.conversation.userId).toBe('alice');
    });
  });

  describe('DELETE /api/conversations/:sessionId - Delete Authorization', () => {
    test('should reject unauthenticated delete requests', async () => {
      const sessionId = `session-${Date.now()}-delete-test`;
      
      const req = new Request(`http://localhost/api/conversations/${sessionId}`, {
        method: 'DELETE'
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(401);
      
      const body = await res.json();
      expect(body.error).toBe('Authentication required');
    });

    test('should prevent cross-user conversation deletion', async () => {
      // Create a conversation owned by alice
      const sessionId = `session-${Date.now()}-delete-alice`;
      await createTestConversation(sessionId, 'alice');

      // Try to delete it as bob
      const bobToken = await createToken('bob');
      const req = new Request(`http://localhost/api/conversations/${sessionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${bobToken}`
        }
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(403);
      
      const body = await res.json();
      expect(body.error).toBe('Unauthorized access to conversation');

      // Verify conversation still exists
      const conversation = await conversationStorage.getConversation(sessionId);
      expect(conversation).not.toBeNull();
      expect(conversation?.userId).toBe('alice');
    });

    test('should allow user to delete their own conversation', async () => {
      // Create a conversation owned by alice
      const sessionId = `session-${Date.now()}-delete-alice-own`;
      await createTestConversation(sessionId, 'alice');

      // Delete it as alice
      const aliceToken = await createToken('alice');
      const req = new Request(`http://localhost/api/conversations/${sessionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${aliceToken}`
        }
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.success).toBe(true);

      // Verify conversation is deleted
      const conversation = await conversationStorage.getConversation(sessionId);
      expect(conversation).toBeNull();
    });
  });

  describe('PATCH /api/conversations/:sessionId/status - Update Authorization', () => {
    test('should reject unauthenticated status update requests', async () => {
      const sessionId = `session-${Date.now()}-patch-test`;
      
      const req = new Request(`http://localhost/api/conversations/${sessionId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'completed' })
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(401);
      
      const body = await res.json();
      expect(body.error).toBe('Authentication required');
    });

    test('should prevent cross-user conversation status mutation', async () => {
      // Create a conversation owned by alice
      const sessionId = `session-${Date.now()}-patch-alice`;
      await createTestConversation(sessionId, 'alice');

      // Try to update status as bob
      const bobToken = await createToken('bob');
      const req = new Request(`http://localhost/api/conversations/${sessionId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bobToken}`
        },
        body: JSON.stringify({ status: 'completed' })
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(403);
      
      const body = await res.json();
      expect(body.error).toBe('Unauthorized access to conversation');

      // Verify status unchanged
      const conversation = await conversationStorage.getConversation(sessionId);
      expect(conversation?.status).toBe('active');
    });

    test('should allow user to update their own conversation status', async () => {
      // Create a conversation owned by alice
      const sessionId = `session-${Date.now()}-patch-alice-own`;
      await createTestConversation(sessionId, 'alice');

      // Update status as alice
      const aliceToken = await createToken('alice');
      const req = new Request(`http://localhost/api/conversations/${sessionId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        },
        body: JSON.stringify({ status: 'completed' })
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.success).toBe(true);

      // Verify status updated
      const conversation = await conversationStorage.getConversation(sessionId);
      expect(conversation?.status).toBe('completed');
    });
  });

  describe('GET /api/conversations - List Authorization', () => {
    test('should reject unauthenticated list requests', async () => {
      const req = new Request('http://localhost/api/conversations', {
        method: 'GET'
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(401);
      
      const body = await res.json();
      expect(body.error).toBe('Authentication required');
    });

    test('should only return conversations owned by authenticated user', async () => {
      // Create conversations for different users
      const aliceSession1 = `session-${Date.now()}-alice-1`;
      const aliceSession2 = `session-${Date.now()}-alice-2`;
      const bobSession = `session-${Date.now()}-bob-1`;
      
      await createTestConversation(aliceSession1, 'alice');
      await createTestConversation(aliceSession2, 'alice');
      await createTestConversation(bobSession, 'bob');

      // List conversations as alice
      const aliceToken = await createToken('alice');
      const req = new Request('http://localhost/api/conversations', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${aliceToken}`
        }
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.success).toBe(true);
      
      // Collect all conversations from grouped response
      const allConversations = [
        ...(body.conversations?.active || []),
        ...(body.conversations?.in_progress || []),
        ...(body.conversations?.completed || [])
      ];

      // Should only see alice's conversations
      expect(allConversations.every((c) => c.userId === 'alice')).toBe(true);
      
      // Should not see bob's conversation
      expect(allConversations.find((c) => c.sessionId === bobSession)).toBeUndefined();
    });
  });

  describe('Backward Compatibility - Legacy Conversations', () => {
    test('should handle legacy conversations without userId field', async () => {
      // Create a legacy conversation (simulating old data without userId)
      const sessionId = `session-${Date.now()}-legacy`;
      const legacyConversation = {
        sessionId,
        // Note: no userId field
        title: 'Legacy Conversation',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: 0,
        status: 'active'
      };
      
      // Directly save to Redis to bypass validation
      await conversationStorage.saveConversation(legacyConversation);

      // Retrieve it - should get 'legacy' as userId
      const retrieved = await conversationStorage.getConversation(sessionId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.userId).toBe('legacy');
    });
  });

  describe('Security Property Assertions', () => {
    test('should enforce authentication on all mutation endpoints', async () => {
      const sessionId = `session-${Date.now()}-security`;
      const endpoints = [
        { method: 'POST', path: '/api/chat', body: { message: 'test', sessionId } },
        { method: 'DELETE', path: `/api/conversations/${sessionId}` },
        { method: 'PATCH', path: `/api/conversations/${sessionId}/status`, body: { status: 'completed' } }
      ];

      for (const endpoint of endpoints) {
        const req = new Request(`http://localhost${endpoint.path}`, {
          method: endpoint.method,
          headers: endpoint.body ? { 'Content-Type': 'application/json' } : {},
          body: endpoint.body ? JSON.stringify(endpoint.body) : undefined
        });

        const res = await app.fetch(req);
        expect(res.status).toBe(401);
        
        const body = await res.json();
        expect(body.error).toBe('Authentication required');
      }
    });

    test('should enforce ownership validation on all conversation operations', async () => {
      // Create a conversation owned by alice
      const sessionId = `session-${Date.now()}-ownership`;
      await createTestConversation(sessionId, 'alice');

      const bobToken = await createToken('bob');
      const endpoints = [
        { method: 'POST', path: '/api/chat', body: { message: 'test', sessionId } },
        { method: 'GET', path: `/api/conversations/${sessionId}` },
        { method: 'DELETE', path: `/api/conversations/${sessionId}` },
        { method: 'PATCH', path: `/api/conversations/${sessionId}/status`, body: { status: 'completed' } }
      ];

      for (const endpoint of endpoints) {
        const req = new Request(`http://localhost${endpoint.path}`, {
          method: endpoint.method,
          headers: {
            'Authorization': `Bearer ${bobToken}`,
            ...(endpoint.body ? { 'Content-Type': 'application/json' } : {})
          },
          body: endpoint.body ? JSON.stringify(endpoint.body) : undefined
        });

        const res = await app.fetch(req);
        expect(res.status).toBe(403);
        
        const body = await res.json();
        expect(body.error).toBe('Unauthorized access to conversation');
      }
    });

    test('should prevent session ID as bearer token vulnerability', async () => {
      // This test verifies that knowing a session ID alone is not sufficient
      // The user must also have a valid JWT token for the conversation owner
      
      const sessionId = `session-${Date.now()}-bearer`;
      await createTestConversation(sessionId, 'alice');

      // Try to access with session ID but wrong user token
      const bobToken = await createToken('bob');
      const req = new Request(`http://localhost/api/conversations/${sessionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${bobToken}`
        }
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(403);
      
      // The session ID is known, but authorization still fails
      // This proves session ID is not functioning as a bearer token
      const body = await res.json();
      expect(body.error).toBe('Unauthorized access to conversation');
    });
  });
});
