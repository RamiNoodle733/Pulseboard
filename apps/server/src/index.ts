import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './env.js';
import { createWSServer } from './ws.js';
import { createPool, runMigrations } from './db.js';
import { registerAuthRoutes } from './auth.js';
import { initModelRouterDB } from './modelRouter.js';
import pg from 'pg';

const isProd = process.env.NODE_ENV === 'production';

// Helper: timeout wrapper for async operations
function withTimeout<T>(promise: Promise<T>, ms: number, name: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${name} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

async function start() {
  // Initialize database if DATABASE_URL is set.
  // In production, prefer degraded mode over crash-loop healthchecks.
  let pool: pg.Pool | null = null;
  let dbHealthy = false;
  if (config.databaseUrl) {
    const candidatePool = createPool(config.databaseUrl);
    try {
      const migrationCount = await withTimeout(
        runMigrations(candidatePool),
        15000,
        'database startup',
      );
      if (migrationCount > 0) {
        console.log(`[pulseboard] database connected, applied ${migrationCount} migration(s)`);
      } else {
        console.log('[pulseboard] database connected, schema up to date');
      }
      initModelRouterDB(candidatePool);
      pool = candidatePool;
      dbHealthy = true;
    } catch (err) {
      console.error('[pulseboard] database migration/connection failed; continuing in degraded mode:', err);
      // Close the failed pool attempt
      try {
        await candidatePool.end();
      } catch {
        // ignore close errors in degraded boot
      }
      pool = null;
      dbHealthy = false;
    }
  } else {
    console.log('[pulseboard] DATABASE_URL not set, running in-memory mode');
  }

  const fastify = Fastify({
    logger: isProd
      ? { level: 'info' }
      : {
          level: 'info',
          transport: {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          },
        },
  });

  await fastify.register(cors, {
    origin: config.clientUrls,
    credentials: true,
  });

  const wsServer = createWSServer(fastify.server, pool);

  // Register auth routes if DB is available
  if (pool) {
    registerAuthRoutes(fastify, pool);
  }

  // graceful shutdown: save stats before exit
  const shutdown = () => {
    console.log('[pulseboard] shutting down, saving stats...');
    wsServer.shutdown();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  fastify.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: Date.now(),
      db: dbHealthy ? 'connected' : 'degraded',
    };
  });

  fastify.get('/stats', async () => {
    return wsServer.getStats();
  });

  fastify.get('/ai/status', async () => {
    return {
      enabled: !!(config.openaiApiKey && config.githubToken),
      paidEnabled: !!config.stripeSecretKey,
      stripePublishableKey: config.stripePublishableKey || null,
    };
  });

  fastify.post('/stripe/create-intent', async (_request, reply) => {
    if (!config.stripeSecretKey) {
      return reply.code(404).send({ error: 'Payments not configured' });
    }

    try {
      const res = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'amount=25&currency=usd&automatic_payment_methods[enabled]=true',
      });

      const data = (await res.json()) as { client_secret: string; id: string };
      return { clientSecret: data.client_secret, paymentIntentId: data.id };
    } catch (err) {
      console.error('[stripe] create-intent failed:', err);
      return reply.code(500).send({ error: 'Payment creation failed' });
    }
  });

  try {
    await fastify.listen({ port: config.port, host: config.host });

    console.log(`[pulseboard] server listening on ${config.host}:${config.port}`);
    console.log(`[pulseboard] client origins: ${config.clientUrls.join(', ')}`);
    console.log(`[pulseboard] discord webhooks: ${config.discordWebhookUrl ? 'enabled' : 'disabled'}`);
    console.log(`[pulseboard] AI features: ${config.openaiApiKey && config.githubToken ? 'enabled' : 'disabled'}`);
    console.log(`[pulseboard] Stripe payments: ${config.stripeSecretKey ? 'enabled' : 'disabled'}`);
    console.log(`[pulseboard] database: ${pool ? (dbHealthy ? 'connected' : 'degraded') : 'in-memory only'}`);
    console.log(`[pulseboard] GitHub OAuth: ${config.githubOAuthClientId ? 'enabled' : 'disabled'}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
