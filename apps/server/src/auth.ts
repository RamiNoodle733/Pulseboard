import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { config } from './env.js';

export interface JWTPayload {
  userId: number;
  githubId: number;
  username: string;
  deviceId: string;
}

export function verifyJWT(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as JWTPayload;
  } catch {
    return null;
  }
}

export function extractAuthFromSocket(
  handshake: { auth?: { token?: string } },
): JWTPayload | null {
  const token = handshake.auth?.token;
  if (!token) return null;
  return verifyJWT(token);
}

export async function ensureDeviceUser(
  pool: pg.Pool,
  deviceId: string,
  color: string,
): Promise<number> {
  // Try to find existing user by device_id
  const { rows } = await pool.query(
    'SELECT id FROM users WHERE device_id = $1',
    [deviceId],
  );
  if (rows.length > 0) {
    await pool.query(
      'UPDATE users SET last_seen_at = NOW(), color = $2 WHERE id = $1',
      [rows[0].id, color],
    );
    return rows[0].id;
  }

  // Create new anonymous user
  const { rows: newRows } = await pool.query(
    'INSERT INTO users (device_id, color) VALUES ($1, $2) RETURNING id',
    [deviceId, color],
  );
  return newRows[0].id;
}

export function registerAuthRoutes(fastify: FastifyInstance, pool: pg.Pool): void {
  if (!config.githubOAuthClientId || !config.githubOAuthClientSecret) {
    console.log('[auth] GitHub OAuth not configured, skipping auth routes');
    return;
  }

  const clientUrl = config.clientUrls[0] || 'http://localhost:5173';

  fastify.get('/auth/github', async (_request, reply) => {
    const state = Math.random().toString(36).substring(2);
    const params = new URLSearchParams({
      client_id: config.githubOAuthClientId!,
      redirect_uri: `${getServerUrl()}/auth/github/callback`,
      scope: 'read:user',
      state,
    });
    return reply.redirect(`https://github.com/login/oauth/authorize?${params}`);
  });

  fastify.get('/auth/github/callback', async (request, reply) => {
    const { code } = request.query as { code?: string };
    if (!code) {
      return reply.code(400).send({ error: 'Missing code parameter' });
    }

    try {
      // Exchange code for access token
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: config.githubOAuthClientId,
          client_secret: config.githubOAuthClientSecret,
          code,
        }),
      });

      const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
      if (!tokenData.access_token) {
        console.error('[auth] GitHub token exchange failed:', tokenData.error);
        return reply.redirect(`${clientUrl}?auth_error=token_exchange_failed`);
      }

      // Fetch user info
      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const ghUser = (await userRes.json()) as {
        id: number;
        login: string;
        name: string | null;
        avatar_url: string;
      };

      // Upsert user in DB - check by github_id first
      const { rows: existing } = await pool.query(
        'SELECT id, device_id FROM users WHERE github_id = $1',
        [ghUser.id],
      );

      let userId: number;
      let deviceId: string;

      if (existing.length > 0) {
        userId = existing[0].id;
        deviceId = existing[0].device_id;
        await pool.query(
          `UPDATE users SET username = $2, display_name = $3, avatar_url = $4, last_seen_at = NOW()
           WHERE id = $1`,
          [userId, ghUser.login, ghUser.name || ghUser.login, ghUser.avatar_url],
        );
      } else {
        // Create new user with a generated device_id
        deviceId = `gh_${ghUser.id}`;
        // Try to link to existing anonymous user with matching device_id, or create new
        const { rows: anonUser } = await pool.query(
          'SELECT id FROM users WHERE device_id = $1',
          [deviceId],
        );
        if (anonUser.length > 0) {
          userId = anonUser[0].id;
          await pool.query(
            `UPDATE users SET github_id = $1, username = $2, display_name = $3, avatar_url = $4, last_seen_at = NOW()
             WHERE id = $5`,
            [ghUser.id, ghUser.login, ghUser.name || ghUser.login, ghUser.avatar_url, userId],
          );
        } else {
          const { rows: newUser } = await pool.query(
            `INSERT INTO users (github_id, username, display_name, avatar_url, device_id)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [ghUser.id, ghUser.login, ghUser.name || ghUser.login, ghUser.avatar_url, deviceId],
          );
          userId = newUser[0].id;
        }
      }

      // Sign JWT
      const token = jwt.sign(
        { userId, githubId: ghUser.id, username: ghUser.login, deviceId } as JWTPayload,
        config.jwtSecret,
        { expiresIn: '30d' },
      );

      return reply.redirect(`${clientUrl}?token=${token}`);
    } catch (err) {
      console.error('[auth] OAuth callback error:', err);
      return reply.redirect(`${clientUrl}?auth_error=server_error`);
    }
  });

  fastify.get('/auth/me', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Not authenticated' });
    }

    const payload = verifyJWT(authHeader.slice(7));
    if (!payload) {
      return reply.code(401).send({ error: 'Invalid token' });
    }

    const { rows } = await pool.query(
      'SELECT id, username, display_name, avatar_url, color FROM users WHERE id = $1',
      [payload.userId],
    );
    if (rows.length === 0) {
      return reply.code(401).send({ error: 'User not found' });
    }

    const user = rows[0];
    return {
      userId: user.id,
      username: user.username,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      color: user.color,
    };
  });

  console.log('[auth] GitHub OAuth routes registered');
}

function getServerUrl(): string {
  if (config.serverPublicUrl) {
    return config.serverPublicUrl.replace(/\/+$/, '');
  }
  return `http://localhost:${config.port}`;
}
