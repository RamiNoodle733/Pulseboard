import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { Server as SocketIOServer } from 'socket.io';
import { createWSServer } from './ws.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Extend Fastify instance type
declare module 'fastify' {
  interface FastifyInstance {
    io?: SocketIOServer;
  }
}

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

  // Register CORS
  await fastify.register(cors, {
    origin: CLIENT_URL,
    credentials: true,
  });

  // Health check endpoint
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: Date.now() };
  });

  // Stats endpoint
  fastify.get('/stats', async () => {
    const stats = (fastify.io as any)?.getStats?.() || {};
    return stats;
  });

  try {
    // Initialize WebSocket server before starting HTTP server
    const io = createWSServer(fastify.server);
    fastify.decorate('io', io);
    
    await fastify.listen({ port: PORT, host: HOST });

    console.log(`
╔═══════════════════════════════════════╗
║                                       ║
║       🌈 PULSEBOARD SERVER 🌈         ║
║                                       ║
║  Server running on:                   ║
║  → http://${HOST}:${PORT}           ║
║                                       ║
║  WebSocket ready for connections      ║
║                                       ║
╚═══════════════════════════════════════╝
    `);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
