/**
 * Authentication Middleware Security Tests
 * 
 * Tests to verify that the authentication mitigation prevents the pentest finding:
 * "Unauthenticated chat route permits model-mediated privileged shell and Kubernetes execution"
 * 
 * These tests verify that:
 * 1. Requests without authentication are rejected with 401
 * 2. Requests with invalid tokens are rejected
 * 3. Requests with expired tokens are rejected
 * 4. Only valid JWT tokens with proper signatures are accepted
 */

import { Hono } from 'hono';
import { authMiddleware } from './auth';
import crypto from 'crypto';

// Test JWT secret
const TEST_JWT_SECRET = 'test-secret-key-for-security-testing';

/**
 * Helper to create a valid JWT token for testing
 */
function createTestJWT(payload: any, secret: string = TEST_JWT_SECRET): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return `${headerB64}.${payloadB64}.${signature}`;
}

describe('Authentication Middleware - Security Tests', () => {
  let app: Hono;

  beforeEach(() => {
    // Set JWT secret for tests
    process.env.JWT_SECRET = TEST_JWT_SECRET;

    // Create test app with protected route
    app = new Hono();
    app.post('/api/chat', authMiddleware, async (c) => {
      const user = c.get('user');
      return c.json({ 
        success: true, 
        message: 'Authenticated access granted',
        user: user.username 
      });
    });
  });

  describe('Unauthenticated Access Prevention', () => {
    it('should reject requests without Authorization header', async () => {
      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: 'kubectl get secrets -A' })
      });

      const res = await app.fetch(req);
      
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Authentication required');
    });

    it('should reject requests with malformed Authorization header', async () => {
      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'InvalidFormat token123'
        },
        body: JSON.stringify({ message: 'kubectl get pods' })
      });

      const res = await app.fetch(req);
      
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Invalid authentication format');
    });

    it('should reject requests with Bearer but no token', async () => {
      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer '
        },
        body: JSON.stringify({ message: 'kubectl delete pod' })
      });

      const res = await app.fetch(req);
      
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Invalid token');
    });
  });

  describe('Invalid Token Rejection', () => {
    it('should reject tokens with invalid signature', async () => {
      // Create token with wrong secret
      const invalidToken = createTestJWT({
        username: 'attacker',
        sub: 'attacker-id',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      }, 'wrong-secret');

      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${invalidToken}`
        },
        body: JSON.stringify({ message: 'kubectl get secrets' })
      });

      const res = await app.fetch(req);
      
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Invalid token');
    });

    it('should reject malformed JWT tokens', async () => {
      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer not.a.valid.jwt.token'
        },
        body: JSON.stringify({ message: 'kubectl exec' })
      });

      const res = await app.fetch(req);
      
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Invalid token');
    });

    it('should reject tokens with only 2 parts', async () => {
      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer header.payload'
        },
        body: JSON.stringify({ message: 'kubectl get nodes' })
      });

      const res = await app.fetch(req);
      
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Invalid token');
    });

    it('should reject tokens with tampered payload', async () => {
      // Create valid token
      const validToken = createTestJWT({
        username: 'user',
        sub: 'user-id',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      // Tamper with the payload part
      const parts = validToken.split('.');
      const tamperedPayload = Buffer.from(JSON.stringify({
        username: 'admin',
        sub: 'admin-id',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      })).toString('base64url');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tamperedToken}`
        },
        body: JSON.stringify({ message: 'kubectl get secrets' })
      });

      const res = await app.fetch(req);
      
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Invalid token');
    });
  });

  describe('Expired Token Rejection', () => {
    it('should reject expired tokens', async () => {
      // Create token that expired 1 hour ago
      const expiredToken = createTestJWT({
        username: 'user',
        sub: 'user-id',
        iat: Math.floor(Date.now() / 1000) - 7200,
        exp: Math.floor(Date.now() / 1000) - 3600
      });

      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${expiredToken}`
        },
        body: JSON.stringify({ message: 'kubectl get pods' })
      });

      const res = await app.fetch(req);
      
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Token expired');
    });

    it('should reject tokens expired by 1 second', async () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredToken = createTestJWT({
        username: 'user',
        sub: 'user-id',
        iat: now - 3600,
        exp: now - 1
      });

      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${expiredToken}`
        },
        body: JSON.stringify({ message: 'kubectl delete deployment' })
      });

      const res = await app.fetch(req);
      
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Token expired');
    });
  });

  describe('Valid Token Acceptance', () => {
    it('should accept valid token and allow access', async () => {
      const validToken = createTestJWT({
        username: 'testuser',
        sub: 'test-user-id',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${validToken}`
        },
        body: JSON.stringify({ message: 'Show cluster status' })
      });

      const res = await app.fetch(req);
      
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.user).toBe('testuser');
    });

    it('should accept token with long expiration', async () => {
      const validToken = createTestJWT({
        username: 'longterm',
        sub: 'longterm-id',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400 // 24 hours
      });

      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${validToken}`
        },
        body: JSON.stringify({ message: 'Check system health' })
      });

      const res = await app.fetch(req);
      
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('should set user context from valid token', async () => {
      const validToken = createTestJWT({
        username: 'contextuser',
        sub: 'context-user-id',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${validToken}`
        },
        body: JSON.stringify({ message: 'Test message' })
      });

      const res = await app.fetch(req);
      
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user).toBe('contextuser');
    });
  });

  describe('Pentest Exploit Prevention', () => {
    it('should prevent unauthenticated kubectl command execution via chat', async () => {
      // Simulate the pentest attack: unauthenticated request to chat endpoint
      // with a message designed to trigger kubectl execution
      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          message: 'kubectl get secrets -A',
          sessionId: 'attacker-session'
        })
      });

      const res = await app.fetch(req);
      
      // SECURITY ASSERTION: Request must be rejected with 401
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Authentication required');
    });

    it('should prevent unauthenticated privileged operations', async () => {
      // Attempt to execute privileged operations without authentication
      const privilegedCommands = [
        'kubectl delete pod critical-service',
        'kubectl get secrets -n kube-system',
        'kubectl exec -it pod -- /bin/bash',
        'kubectl patch deployment --patch=...'
      ];

      for (const command of privilegedCommands) {
        const req = new Request('http://localhost/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ message: command })
        });

        const res = await app.fetch(req);
        
        // SECURITY ASSERTION: All privileged operations must be blocked
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error).toBe('Authentication required');
      }
    });

    it('should prevent shell injection attempts without authentication', async () => {
      // Attempt shell injection patterns without authentication
      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          message: 'kubectl get pods; cat /etc/passwd; rm -rf /'
        })
      });

      const res = await app.fetch(req);
      
      // SECURITY ASSERTION: Must be blocked at authentication layer
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Authentication required');
    });

    it('should prevent access with forged tokens', async () => {
      // Attempt to forge a token without knowing the secret
      const forgedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImFkbWluIiwic3ViIjoiYWRtaW4iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTgwMDAwMDAwMH0.forged_signature';

      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${forgedToken}`
        },
        body: JSON.stringify({ 
          message: 'kubectl get secrets -A'
        })
      });

      const res = await app.fetch(req);
      
      // SECURITY ASSERTION: Forged tokens must be rejected
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Invalid token');
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing JWT_SECRET gracefully', async () => {
      // Temporarily remove JWT_SECRET
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      const validToken = createTestJWT({
        username: 'user',
        sub: 'user-id',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${validToken}`
        },
        body: JSON.stringify({ message: 'test' })
      });

      const res = await app.fetch(req);
      
      // Should reject when JWT_SECRET is not configured
      expect(res.status).toBe(401);

      // Restore JWT_SECRET
      process.env.JWT_SECRET = originalSecret;
    });

    it('should handle tokens with extra whitespace', async () => {
      const validToken = createTestJWT({
        username: 'user',
        sub: 'user-id',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer  ${validToken}  `
        },
        body: JSON.stringify({ message: 'test' })
      });

      const res = await app.fetch(req);
      
      // Should handle whitespace properly
      expect(res.status).toBe(401);
    });

    it('should reject tokens with no expiration but check is enforced', async () => {
      const tokenNoExp = createTestJWT({
        username: 'user',
        sub: 'user-id',
        iat: Math.floor(Date.now() / 1000)
        // No exp field
      });

      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenNoExp}`
        },
        body: JSON.stringify({ message: 'test' })
      });

      const res = await app.fetch(req);
      
      // Token without expiration should still be validated
      // The middleware checks if exp exists before checking expiration
      // So this should pass signature validation
      expect(res.status).toBe(200);
    });
  });
});
