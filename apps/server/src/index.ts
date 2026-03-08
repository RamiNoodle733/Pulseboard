import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './env.js';
import { createWSServer } from './ws.js';

async function start() {
  const fastify = Fastify({
    logger: {
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

  const wsServer = createWSServer(fastify.server);

  // graceful shutdown: save stats before exit
  const shutdown = () => {
    console.log('[pulseboard] shutting down, saving stats...');
    wsServer.shutdown();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: Date.now() };
  });

  fastify.get('/stats', async () => {
    return wsServer.getStats();
  });

  fastify.get('/ai/status', async () => {
    return {
      enabled: !!(config.anthropicApiKey && config.githubToken),
      paidEnabled: !!config.stripeSecretKey,
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
    console.log(`[pulseboard] AI features: ${config.anthropicApiKey && config.githubToken ? 'enabled' : 'disabled'}`);
    console.log(`[pulseboard] Stripe payments: ${config.stripeSecretKey ? 'enabled' : 'disabled'}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
