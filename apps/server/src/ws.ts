import { Server as HTTPServer } from 'http';
import { Server } from 'socket.io';
import { nanoid } from 'nanoid';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  User,
  WSStats,
} from './types.js';
import { config } from './env.js';
import { checkPulseLimit, checkColorChangeCooldown } from './rateLimit.js';
import { createStreakManager } from './streak.js';
import { notifyDiscord } from './discord.js';
import { resolveLocation, formatRegion } from './geo.js';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function extractIp(socket: { handshake: { headers: Record<string, string | string[] | undefined>; address: string } }): string {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded) && forwarded.length > 0) return forwarded[0];
  return socket.handshake.address;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export interface WSServer {
  io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
  getStats: () => WSStats;
}

export function createWSServer(httpServer: HTTPServer): WSServer {
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: config.clientUrls,
      credentials: true,
    },
  });

  const users = new Map<string, User>();
  let userOrdinalCounter = 0;
  const streakManager = createStreakManager();

  function connectedCount(): number {
    return io.sockets.sockets.size;
  }

  // broadcast user count periodically
  setInterval(() => {
    io.emit('ws:user-count', { count: connectedCount() });
  }, 5000);

  // check for streak inactivity break every 500ms
  setInterval(() => {
    if (streakManager.checkInactivity()) {
      io.emit('ws:streak-broken');
    }
  }, 500);

  io.on('connection', (socket) => {
    console.log(`[ws] socket connected: ${socket.id}`);

    socket.on('ws:join', async ({ color, userAgent }) => {
      if (!HEX_COLOR.test(color)) {
        socket.emit('ws:error', { message: 'Invalid color format' });
        return;
      }

      const userId = nanoid();
      userOrdinalCounter += 1;
      const ip = extractIp(socket);
      const ua = userAgent || 'unknown';

      // resolve geo (non-blocking, defaults to empty)
      const geo = await resolveLocation(ip);
      const region = formatRegion(geo);

      const user: User = {
        id: userId,
        ordinal: userOrdinalCounter,
        color,
        region,
        createdAt: Date.now(),
        lastPulse: 0,
        lastColorChange: Date.now(),
        userAgent: ua,
        ip,
      };

      users.set(userId, user);

      socket.data.userId = userId;
      socket.data.ordinal = userOrdinalCounter;
      socket.data.color = color;
      socket.data.userAgent = ua;

      console.log(`[user] User${userOrdinalCounter} joined with ${color} from ${region || 'unknown'}`);

      const count = connectedCount();

      socket.emit('ws:joined', {
        ordinal: userOrdinalCounter,
        color,
        streak: streakManager.getCurrentStreak(),
        bestStreak: streakManager.getBestStreak(),
        syncRequired: streakManager.getState(count).requiredUsers,
        userCount: count,
      });

      io.emit('ws:user-count', { count });

      notifyDiscord('user_join', {
        ordinal: userOrdinalCounter,
        color,
        ip,
        userAgent: ua,
        userCount: count,
        extra: region ? { location: region } : undefined,
      });
    });

    socket.on('ws:pulse', async ({ x, y }) => {
      const userId = socket.data.userId;
      if (!userId) {
        socket.emit('ws:error', { message: 'Not authenticated' });
        return;
      }

      const user = users.get(userId);
      if (!user) {
        socket.emit('ws:error', { message: 'User not found' });
        return;
      }

      const allowed = await checkPulseLimit(userId);
      if (!allowed) {
        socket.emit('ws:error', { message: 'Slow down' });
        return;
      }

      const now = Date.now();
      user.lastPulse = now;

      const px = clamp01(x);
      const py = clamp01(y);

      const count = connectedCount();
      const result = streakManager.addPulse(userId, now, count);

      io.emit('ws:pulse', {
        userId,
        color: user.color,
        t: now,
        ordinal: user.ordinal,
        x: px,
        y: py,
        region: user.region,
      });

      // feed entry for every pulse
      io.emit('ws:feed', {
        type: 'pulse',
        ordinal: user.ordinal,
        color: user.color,
        region: user.region,
        t: now,
      });

      if (result.streakBroken) {
        io.emit('ws:streak-broken');
      }

      if (result.streakIncreased) {
        const streak = streakManager.getCurrentStreak();

        // collect countries of synced users
        const countries: string[] = [];
        for (const uid of result.syncedUserIds) {
          const u = users.get(uid);
          if (u && u.region) {
            const cc = u.region.split(', ').pop() || '';
            if (cc && !countries.includes(cc)) countries.push(cc);
          }
        }

        io.emit('ws:burst', {
          streak,
          contributors: result.contributors,
          countries,
          userIds: result.syncedUserIds,
        });

        // sync feed entry
        io.emit('ws:feed', {
          type: 'sync',
          ordinal: user.ordinal,
          color: user.color,
          region: user.region,
          t: now,
          streak,
          countries,
        });

        if (streak % 5 === 0 || streak === streakManager.getBestStreak()) {
          notifyDiscord(
            streak === streakManager.getBestStreak() ? 'streak_record' : 'streak_milestone',
            {
              ordinal: user.ordinal,
              color: user.color,
              ip: user.ip,
              userAgent: user.userAgent,
              userCount: count,
              extra: { streak, contributors: result.contributors },
            },
          );
        }
      }
    });

    socket.on('ws:change-color', ({ color }) => {
      const userId = socket.data.userId;
      if (!userId) {
        socket.emit('ws:error', { message: 'Not authenticated' });
        return;
      }

      const user = users.get(userId);
      if (!user) {
        socket.emit('ws:error', { message: 'User not found' });
        return;
      }

      if (!HEX_COLOR.test(color)) {
        socket.emit('ws:error', { message: 'Invalid color format' });
        return;
      }

      if (!checkColorChangeCooldown(user.lastColorChange)) {
        const remaining = Math.ceil(
          (config.colorChangeCooldown * 1000 - (Date.now() - user.lastColorChange)) / 1000,
        );
        socket.emit('ws:error', {
          message: `Color change on cooldown. Wait ${remaining}s`,
        });
        return;
      }

      user.color = color;
      user.lastColorChange = Date.now();
      socket.data.color = color;

      console.log(`[user] User${user.ordinal} changed color to ${color}`);

      io.emit('ws:color-changed', {
        userId,
        color,
        ordinal: user.ordinal,
      });
    });

    socket.on('disconnect', () => {
      const userId = socket.data.userId;
      if (userId) {
        const user = users.get(userId);
        if (user) {
          console.log(`[user] User${user.ordinal} disconnected`);

          notifyDiscord('user_leave', {
            ordinal: user.ordinal,
            color: user.color,
            ip: user.ip,
            userAgent: user.userAgent,
            userCount: connectedCount() - 1,
            extra: {
              sessionDuration: `${Math.round((Date.now() - user.createdAt) / 1000)}s`,
            },
          });
        }
        users.delete(userId);
      }

      io.emit('ws:user-count', { count: connectedCount() });
    });
  });

  console.log('[ws] websocket server initialized');

  function getStats(): WSStats {
    const count = connectedCount();
    return {
      connectedUsers: count,
      totalUsersCreated: userOrdinalCounter,
      ...streakManager.getState(count),
    };
  }

  return { io, getStats };
}
