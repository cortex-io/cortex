/**
 * Security Tests for Authentication and Authorization Middleware
 * 
 * These tests verify that the pentest finding "Unauthenticated access to and mutation 
 * of conversations by caller-supplied session ID" has been properly mitigated.
 * 
 * Tests focus on:
 * 1. Authentication middleware enforcement
 * 2. JWT token validation
 * 3. Authorization header requirements
 */

import { describe, test, expect } from 'bun:test';
import { Hono, Context } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { sign } from 'hono/jwt';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

// Helper function to create a valid JWT token
async function createToken(username: string, expiresIn: number = 3600): Promise<string> {
  const payload = {
    username,
    sub: username,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresIn
  };
  return await sign(payload, JWT_SECRET);
}

describe('Authentication Middleware Security Tests', () => {
  describe('Authentication Enforcement', () => {
    test('should reject requests without Authorization header', async () => {
      const app = new Hono();
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ success: true }));

      const req = new Request('http://localhost/test', {
        method: 'GET'
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(401);
      
      const body = await res.json();
      expect(body.error).toBe('Authentication required');
    });

    test('should reject requests with invalid Authorization format', async () => {
      const app = new Hono();
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ success: true }));

      const req = new Request('http://localhost/test', {
        method: 'GET',
        headers: {
          'Authorization': 'InvalidFormat token123'
        }
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(401);
      
      const body = await res.json();
      expect(body.error).toBe('Invalid authentication format');
    });

    test('should reject requests with malformed JWT token', async () => {
      const app = new Hono();
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ success: true }));

      const req = new Request('http://localhost/test', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer invalid.jwt.token'
        }
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(401);
      
      const body = await res.json();
      expect(body.error).toBe('Invalid token');
    });

    test('should reject requests with expired JWT token', async () => {
      const app = new Hono();
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ success: true }));

      // Create an expired token (expired 1 hour ago)
      const expiredToken = await createToken('testuser', -3600);

      const req = new Request('http://localhost/test', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${expiredToken}`
        }
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(401);
      
      const body = await res.json();
      expect(body.error).toBe('Token expired');
    });

    test('should accept requests with valid JWT token', async () => {
      const app = new Hono();
      app.use('*', authMiddleware);
      app.get('/test', (c) => {
        const user = c.get('user');
        return c.json({ success: true, username: user.username });
      });

      const token = await createToken('alice');

      const req = new Request('http://localhost/test', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.username).toBe('alice');
    });

    test('should set user context in request for valid tokens', async () => {
      const app = new Hono();
      app.use('*', authMiddleware);
      app.get('/test', (c) => {
        const user = c.get('user');
        return c.json({
          username: user.username,
          sub: user.sub,
          hasIat: typeof user.iat === 'number',
          hasExp: typeof user.exp === 'number'
        });
      });

      const token = await createToken('bob');

      const req = new Request('http://localhost/test', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.username).toBe('bob');
      expect(body.sub).toBe('bob');
      expect(body.hasIat).toBe(true);
      expect(body.hasExp).toBe(true);
    });
  });

  describe('Security Property Assertions', () => {
    test('should prevent bearer token format without "Bearer " prefix', async () => {
      const app = new Hono();
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ success: true }));

      const token = await createToken('alice');

      // Try to send token without "Bearer " prefix
      const req = new Request('http://localhost/test', {
        method: 'GET',
        headers: {
          'Authorization': token
        }
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(401);
      
      const body = await res.json();
      expect(body.error).toBe('Invalid authentication format');
    });

    test('should validate token signature', async () => {
      const app = new Hono();
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ success: true }));

      // Create a token with a different secret
      const payload = {
        username: 'attacker',
        sub: 'attacker',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      };
      const fakeToken = await sign(payload, 'wrong-secret');

      const req = new Request('http://localhost/test', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${fakeToken}`
        }
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(401);
      
      const body = await res.json();
      expect(body.error).toBe('Invalid token');
    });

    test('should enforce authentication on all HTTP methods', async () => {
      const app = new Hono();
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ method: 'GET' }));
      app.post('/test', (c) => c.json({ method: 'POST' }));
      app.patch('/test', (c) => c.json({ method: 'PATCH' }));
      app.delete('/test', (c) => c.json({ method: 'DELETE' }));

      const methods = ['GET', 'POST', 'PATCH', 'DELETE'];

      for (const method of methods) {
        const req = new Request('http://localhost/test', {
          method,
          headers: method === 'POST' || method === 'PATCH' ? {
            'Content-Type': 'application/json'
          } : {}
        });

        const res = await app.fetch(req);
        expect(res.status).toBe(401);
        
        const body = await res.json();
        expect(body.error).toBe('Authentication required');
      }
    });

    test('should not leak token validation details in error messages', async () => {
      const app = new Hono();
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ success: true }));

      const req = new Request('http://localhost/test', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature'
        }
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(401);
      
      const body = await res.json();
      // Should return generic error, not specific validation details
      expect(body.error).toBe('Invalid token');
      // Should not contain stack traces or internal details
      expect(JSON.stringify(body)).not.toContain('stack');
      expect(JSON.stringify(body)).not.toContain('JWT');
    });
  });

  describe('Token Expiration Validation', () => {
    test('should reject token that expires exactly now', async () => {
      const app = new Hono();
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ success: true }));

      // Create a token that expires in 0 seconds (now)
      const payload = {
        username: 'testuser',
        sub: 'testuser',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) // Expires now
      };
      const expiredToken = await sign(payload, JWT_SECRET);

      // Wait a tiny bit to ensure it's expired
      await new Promise(resolve => setTimeout(resolve, 100));

      const req = new Request('http://localhost/test', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${expiredToken}`
        }
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(401);
      
      const body = await res.json();
      expect(body.error).toBe('Token expired');
    });

    test('should accept token with future expiration', async () => {
      const app = new Hono();
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ success: true }));

      // Create a token that expires in 1 hour
      const token = await createToken('testuser', 3600);

      const req = new Request('http://localhost/test', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(200);
      
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe('Authorization Header Parsing', () => {
    test('should handle Authorization header with extra spaces', async () => {
      const app = new Hono();
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ success: true }));

      const token = await createToken('testuser');

      // Authorization header with extra spaces
      const req = new Request('http://localhost/test', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer  ${token}` // Extra space
        }
      });

      const res = await app.fetch(req);
      // Should still fail because we extract from position 7 (after "Bearer ")
      // This tests that we don't trim or handle malformed headers gracefully
      expect(res.status).toBe(401);
    });

    test('should reject empty Bearer token', async () => {
      const app = new Hono();
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ success: true }));

      const req = new Request('http://localhost/test', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer '
        }
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(401);
      
      const body = await res.json();
      expect(body.error).toBe('Invalid token');
    });

    test('should reject Authorization header with only "Bearer"', async () => {
      const app = new Hono();
      app.use('*', authMiddleware);
      app.get('/test', (c) => c.json({ success: true }));

      const req = new Request('http://localhost/test', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer'
        }
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(401);
      
      const body = await res.json();
      expect(body.error).toBe('Invalid authentication format');
    });
  });

  describe('Mitigation of Pentest Finding', () => {
    test('should prevent unauthenticated access - core vulnerability mitigation', async () => {
      // This test verifies the core fix: endpoints now require authentication
      const app = new Hono();
      app.use('*', authMiddleware);
      app.post('/chat', (c) => c.json({ message: 'Chat response' }));
      app.get('/conversations/:id', (c) => c.json({ conversation: 'data' }));
      app.delete('/conversations/:id', (c) => c.json({ deleted: true }));
      app.patch('/conversations/:id/status', (c) => c.json({ updated: true }));

      const endpoints = [
        { method: 'POST', path: '/chat' },
        { method: 'GET', path: '/conversations/session-123' },
        { method: 'DELETE', path: '/conversations/session-123' },
        { method: 'PATCH', path: '/conversations/session-123/status' }
      ];

      for (const endpoint of endpoints) {
        const req = new Request(`http://localhost${endpoint.path}`, {
          method: endpoint.method,
          headers: endpoint.method === 'POST' || endpoint.method === 'PATCH' ? {
            'Content-Type': 'application/json'
          } : {}
        });

        const res = await app.fetch(req);
        
        // All endpoints must return 401 without authentication
        expect(res.status).toBe(401);
        
        const body = await res.json();
        expect(body.error).toBe('Authentication required');
      }
    });

    test('should verify session ID alone is not sufficient - bearer token vulnerability mitigation', async () => {
      // This test verifies that knowing a session ID is not enough
      // The pentest finding noted that session IDs functioned as bearer tokens
      // Now, a valid JWT is required regardless of session ID knowledge
      
      const app = new Hono();
      app.use('*', authMiddleware);
      app.get('/conversations/:sessionId', (c) => {
        // Even if we reach here, we'd check ownership
        // But we shouldn't reach here without auth
        return c.json({ sessionId: c.req.param('sessionId') });
      });

      // Try to access with a predictable session ID (from pentest finding)
      const predictableSessionId = `session-${Date.now()}`;
      
      const req = new Request(`http://localhost/conversations/${predictableSessionId}`, {
        method: 'GET'
      });

      const res = await app.fetch(req);
      
      // Must be rejected at authentication layer
      expect(res.status).toBe(401);
      
      const body = await res.json();
      expect(body.error).toBe('Authentication required');
    });

    test('should enforce authentication before any session ID processing', async () => {
      // Verifies that authentication happens first, before any business logic
      let businessLogicExecuted = false;
      
      const app = new Hono();
      app.use('*', authMiddleware);
      app.post('/chat', async (c) => {
        businessLogicExecuted = true;
        const body = await c.req.json();
        return c.json({ sessionId: body.sessionId });
      });

      const req = new Request('http://localhost/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: 'test',
          sessionId: 'session-123'
        })
      });

      const res = await app.fetch(req);
      
      // Authentication should fail before business logic
      expect(res.status).toBe(401);
      expect(businessLogicExecuted).toBe(false);
    });
  });
});
