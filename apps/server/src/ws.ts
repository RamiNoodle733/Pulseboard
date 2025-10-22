import { Server as HTTPServer } from 'http';
import { Server } from 'socket.io';
import { nanoid } from 'nanoid';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  User,
} from './types.js';
import { checkPulseLimit, checkColorChangeCooldown } from './rateLimit.js';
import { createStreakManager } from './streak.js';

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

export function createWSServer(httpServer: HTTPServer) {
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: CLIENT_URL,
      credentials: true,
    },
  });

  // In-memory storage
  const users = new Map<string, User>();
  let userOrdinalCounter = 0;

  const streakManager = createStreakManager();

  // Broadcast user count periodically
  setInterval(() => {
    const connectedCount = io.sockets.sockets.size;
    io.emit('ws:user-count', { count: connectedCount });
  }, 5000);

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // Handle user join
    socket.on('ws:join', ({ color }) => {
      // Validate color (basic hex validation)
      if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
        socket.emit('ws:error', { message: 'Invalid color format' });
        return;
      }

      const userId = nanoid();
      userOrdinalCounter += 1;

      const user: User = {
        id: userId,
        ordinal: userOrdinalCounter,
        color,
        createdAt: Date.now(),
        lastPulse: 0,
        lastColorChange: Date.now(),
      };

      users.set(userId, user);

      // Store user data in socket
      socket.data.userId = userId;
      socket.data.ordinal = userOrdinalCounter;
      socket.data.color = color;

      console.log(`👤 User${userOrdinalCounter} joined with color ${color}`);

      // Send welcome message
      socket.emit('ws:joined', {
        ordinal: userOrdinalCounter,
        color,
        streak: streakManager.getCurrentStreak(),
        bestStreak: streakManager.getBestStreak(),
      });

      // Broadcast user count update
      io.emit('ws:user-count', { count: io.sockets.sockets.size });
    });

    // Handle pulse
    socket.on('ws:pulse', async () => {
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

      // Check rate limit
      const allowed = await checkPulseLimit(userId);
      if (!allowed) {
        socket.emit('ws:error', { message: 'Rate limited. Slow down!' });
        return;
      }

      const now = Date.now();
      user.lastPulse = now;

      // Add pulse to streak manager
      const result = streakManager.addPulse(userId, now);

      // Broadcast pulse to all clients
      io.emit('ws:pulse', {
        userId,
        color: user.color,
        t: now,
        ordinal: user.ordinal,
      });

      // If streak increased, celebrate!
      if (result.streakIncreased) {
        io.emit('ws:burst', {
          streak: streakManager.getCurrentStreak(),
          contributors: result.contributors,
        });
      }

      // If streak broke, notify
      if (result.streakBroken) {
        io.emit('ws:streak-broken');
      }
    });

    // Handle color change
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

      // Validate color
      if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
        socket.emit('ws:error', { message: 'Invalid color format' });
        return;
      }

      // Check cooldown
      if (!checkColorChangeCooldown(user.lastColorChange)) {
        const remainingSeconds = Math.ceil(
          (300000 - (Date.now() - user.lastColorChange)) / 1000
        );
        socket.emit('ws:error', {
          message: `Color change on cooldown. Wait ${remainingSeconds}s`,
        });
        return;
      }

      // Update color
      user.color = color;
      user.lastColorChange = Date.now();
      socket.data.color = color;

      console.log(`🎨 User${user.ordinal} changed color to ${color}`);

      // Broadcast color change
      io.emit('ws:color-changed', {
        userId,
        color,
        ordinal: user.ordinal,
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      const userId = socket.data.userId;
      if (userId) {
        const user = users.get(userId);
        if (user) {
          console.log(`👋 User${user.ordinal} disconnected`);
        }
        users.delete(userId);
      }
      
      // Broadcast user count update
      io.emit('ws:user-count', { count: io.sockets.sockets.size });
    });
  });

  // Add stats getter
  (io as any).getStats = () => {
    return {
      connectedUsers: io.sockets.sockets.size,
      totalUsersCreated: userOrdinalCounter,
      ...streakManager.getState(),
    };
  };

  console.log('✅ WebSocket server initialized');

  return io;
}
