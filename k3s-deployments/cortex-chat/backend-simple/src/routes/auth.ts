import { Hono } from 'hono';
import { sign } from 'hono/jwt';

export function createAuthRoutes() {
  const app = new Hono();

  // Configuration
  const AUTH_USERNAME = process.env.AUTH_USERNAME || 'ryan';
  const AUTH_PASSWORD = process.env.AUTH_PASSWORD || '7vuzjzuN9!';
  const JWT_SECRET = process.env.JWT_SECRET || 'cortex-chat-secret-key-change-in-production';
  const JWT_EXPIRES_IN = '24h'; // 24 hours

  /**
   * POST /login
   * Authenticate user and return JWT token
   */
  app.post('/login', async (c) => {
    try {
      const body = await c.req.json();
      const { username, password } = body;

      // Log auth attempt (without password)
      console.log('[Auth] Login attempt:', { username, timestamp: new Date().toISOString() });

      // Validate credentials
      if (!username || !password) {
        console.log('[Auth] Missing credentials');
        return c.json({ error: 'Username and password are required' }, 400);
      }

      if (username !== AUTH_USERNAME || password !== AUTH_PASSWORD) {
        console.log('[Auth] Invalid credentials for user:', username);
        return c.json({ error: 'Invalid credentials' }, 401);
      }

      // Generate JWT token
      const now = Math.floor(Date.now() / 1000);
      const expiresIn = 24 * 60 * 60; // 24 hours in seconds

      const payload = {
        sub: username,
        username: username,
        iat: now,
        exp: now + expiresIn
      };

      const token = await sign(payload, JWT_SECRET);

      console.log('[Auth] Login successful for user:', username);

      return c.json({
        success: true,
        token,
        user: { username },
        expiresIn: JWT_EXPIRES_IN
      });

    } catch (error) {
      console.error('[Auth] Error in login endpoint:', error);
      return c.json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });

  /**
   * POST /verify
   * Verify token validity (optional endpoint for debugging)
   */
  app.post('/verify', async (c) => {
    try {
      const authHeader = c.req.header('Authorization');

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ valid: false, error: 'No token provided' }, 401);
      }

      const token = authHeader.substring(7);

      try {
        const { verify } = await import('hono/jwt');
        const payload = await verify(token, JWT_SECRET);

        return c.json({
          valid: true,
          user: { username: payload.username },
          expiresAt: new Date(payload.exp * 1000).toISOString()
        });
      } catch (err) {
        return c.json({ valid: false, error: 'Invalid token' }, 401);
      }

    } catch (error) {
      console.error('[Auth] Error in verify endpoint:', error);
      return c.json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  });

  return app;
}
