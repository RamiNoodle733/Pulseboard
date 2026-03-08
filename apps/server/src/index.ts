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

  try {
    await fastify.listen({ port: config.port, host: config.host });

    console.log(`[pulseboard] server listening on ${config.host}:${config.port}`);
    console.log(`[pulseboard] client origins: ${config.clientUrls.join(', ')}`);
    console.log(`[pulseboard] discord webhooks: ${config.discordWebhookUrl ? 'enabled' : 'disabled'}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
