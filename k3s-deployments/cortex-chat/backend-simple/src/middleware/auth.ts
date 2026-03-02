import { Context, Next } from 'hono';
import { verify } from 'hono/jwt';

const JWT_SECRET = process.env.JWT_SECRET || 'cortex-chat-secret-key-change-in-production';

export interface AuthUser {
  username: string;
  sub: string;
  iat: number;
  exp: number;
}

/**
 * Auth middleware to verify JWT tokens
 * Adds user context to c.get('user') if valid
 */
export async function authMiddleware(c: Context, next: Next) {
  try {
    const authHeader = c.req.header('Authorization');

    if (!authHeader) {
      console.log('[AuthMiddleware] No Authorization header');
      return c.json({ error: 'Authentication required' }, 401);
    }

    if (!authHeader.startsWith('Bearer ')) {
      console.log('[AuthMiddleware] Invalid Authorization header format');
      return c.json({ error: 'Invalid authentication format' }, 401);
    }

    const token = authHeader.substring(7);

    try {
      const payload = await verify(token, JWT_SECRET) as AuthUser;

      // Check token expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        console.log('[AuthMiddleware] Token expired for user:', payload.username);
        return c.json({ error: 'Token expired' }, 401);
      }

      // Set user context
      c.set('user', payload);
      console.log('[AuthMiddleware] Authenticated user:', payload.username);

      await next();

    } catch (err) {
      console.log('[AuthMiddleware] Invalid token:', err instanceof Error ? err.message : 'Unknown error');
      return c.json({ error: 'Invalid token' }, 401);
    }

  } catch (error) {
    console.error('[AuthMiddleware] Error in auth middleware:', error);
    return c.json({
      error: 'Authentication error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
}

/**
 * Optional auth middleware - doesn't fail if no token provided
 * Adds user context if valid token exists
 */
export async function optionalAuthMiddleware(c: Context, next: Next) {
  try {
    const authHeader = c.req.header('Authorization');

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      try {
        const payload = await verify(token, JWT_SECRET) as AuthUser;

        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp >= now) {
          c.set('user', payload);
          console.log('[OptionalAuthMiddleware] Authenticated user:', payload.username);
        }
      } catch (err) {
        // Silently ignore invalid tokens in optional mode
        console.log('[OptionalAuthMiddleware] Invalid token, proceeding without auth');
      }
    }

    await next();

  } catch (error) {
    console.error('[OptionalAuthMiddleware] Error:', error);
    await next();
  }
}
