import { Server as HTTPServer } from 'http';
import { Server } from 'socket.io';
import { nanoid } from 'nanoid';
import pg from 'pg';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  User,
  WSStats,
  GlobalStatsPayload,
  UserProfilePayload,
} from './types.js';
import { config } from './env.js';
import {
  checkPulseLimit,
  checkColorChangeCooldown,
  checkPromptRateLimit,
  checkFreePromptLimit,
  consumeFreePrompt,
  getFreePromptsRemaining,
} from './rateLimit.js';
import { createStreakManager } from './streak.js';
import { notifyDiscord } from './discord.js';
import { resolveLocation, formatRegion } from './geo.js';
import { createStatsManager } from './stats.js';
import { createDBStatsManager } from './db/stats.js';
import { createDBProposalManager } from './db/proposals.js';
import { haversineKm } from './haversine.js';
import { generateChanges } from './ai.js';
import { createPR, mergePR, closePR } from './github.js';
import { createProposalManager } from './proposals.js';
import { createWorldStateManager } from './worldState.js';
import { createEventDirector } from './eventDirector.js';
import { createNarrator } from './narrator.js';
import { extractAuthFromSocket, ensureDeviceUser } from './auth.js';
import { createXPManager, XP_PER_SYNC, XP_PER_ENERGY_UNIT, XP_PER_PRESENCE_MINUTE, type XPManager } from './xp.js';
import { createUpgradeManager, DEFAULT_MULTIPLIERS, type UpgradeManager } from './upgrades.js';
import { createLeaderboardManager, type LeaderboardManager } from './leaderboard.js';
import { createTerritoryManager, type TerritoryManager } from './territory.js';

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

async function verifyPaymentIntent(id: string): Promise<boolean> {
  if (!config.stripeSecretKey) return false;
  try {
    const res = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${config.stripeSecretKey}` },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { status: string; amount: number };
    return data.status === 'succeeded' && data.amount === 25;
  } catch {
    return false;
  }
}

export interface WSServer {
  io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
  getStats: () => WSStats;
  shutdown: () => void;
}

export function createWSServer(httpServer: HTTPServer, pool: pg.Pool | null): WSServer {
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
  const worldState = createWorldStateManager();
  const eventDirector = createEventDirector();
  const narrator = createNarrator();

  // Use DB-backed managers if pool available, else fall back to JSON-file managers
  const useDB = !!pool;
  const dbStatsManager = pool ? createDBStatsManager(pool) : null;
  const dbProposalManager = pool ? createDBProposalManager(pool) : null;
  const fallbackStatsManager = pool ? null : createStatsManager();
  const fallbackProposalManager = pool ? null : createProposalManager();

  // Gamification managers (DB-only)
  const xpManager: XPManager | null = pool ? createXPManager(pool) : null;
  const upgradeManager: UpgradeManager | null = pool ? createUpgradeManager(pool) : null;
  const leaderboardManager: LeaderboardManager | null = pool ? createLeaderboardManager(pool) : null;

  // Territory manager (DB-only)
  const territoryManager: TerritoryManager | null = pool ? createTerritoryManager(pool) : null;

  // Unified interfaces to abstract over DB vs fallback
  const statsManager = {
    recordPulse(city: string, now: number) {
      if (dbStatsManager) dbStatsManager.recordPulse(city, now);
      else fallbackStatsManager!.recordPulse(city, now);
    },
    recordSync(cities: string[], streak: number) {
      if (dbStatsManager) dbStatsManager.recordSync(cities, streak);
      else fallbackStatsManager!.recordSync(cities, streak);
    },
    getPulsesPerMinute() {
      return dbStatsManager ? dbStatsManager.getPulsesPerMinute() : fallbackStatsManager!.getPulsesPerMinute();
    },
    getTopCities(n: number) {
      return dbStatsManager ? dbStatsManager.getTopCities(n) : fallbackStatsManager!.getTopCities(n);
    },
    getSnapshot() {
      return dbStatsManager ? dbStatsManager.getSnapshot() : fallbackStatsManager!.getSnapshot();
    },
  };

  // Initialize
  (async () => {
    if (dbStatsManager) {
      await dbStatsManager.loadFromDB();
      dbStatsManager.startAutoSave();
    } else {
      fallbackStatsManager!.startAutoSave();
    }
    if (fallbackProposalManager) {
      fallbackProposalManager.startAutoSave();
    }
  })();

  function connectedCount(): number {
    return io.sockets.sockets.size;
  }

  function buildGlobalStats(): GlobalStatsPayload {
    const snapshot = statsManager.getSnapshot();
    return {
      totalPulses: snapshot.totalPulses,
      totalSyncs: snapshot.totalSyncs,
      bestStreakAllTime: snapshot.bestStreakAllTime,
      activeCities: Object.keys(snapshot.cities).length,
      topCities: statsManager.getTopCities(10),
      pulsesPerMinute: statsManager.getPulsesPerMinute(),
    };
  }

  // Helper to send XP updates to a socket
  async function emitXPUpdate(
    socket: Parameters<Parameters<typeof io.on>[1]>[0],
    userId: number,
    result: { newXP: number; newLevel: number; leveledUp: boolean; xpToNextLevel: number },
  ): Promise<void> {
    socket.emit('ws:xp-update', {
      xp: result.newXP,
      totalXP: result.newXP, // We'll fetch real totalXP
      level: result.newLevel,
      xpToNextLevel: result.xpToNextLevel,
      leveledUp: result.leveledUp,
    });
  }

  // Award XP to all synced users
  async function awardSyncXP(syncedUserIds: string[]): Promise<void> {
    if (!xpManager) return;
    for (const uid of syncedUserIds) {
      const u = users.get(uid);
      if (u?.dbUserId) {
        try {
          const result = await xpManager.awardXP(u.dbUserId, XP_PER_SYNC);
          // Find the socket for this user to send them the update
          for (const [, s] of io.sockets.sockets) {
            if (s.data.userId === uid) {
              emitXPUpdate(s, u.dbUserId, result);
              break;
            }
          }
        } catch { /* ignore */ }
      }
    }
  }

  function handleStreakResult(
    result: { streakIncreased: boolean; streakBroken: boolean; contributors: number; syncedUserIds: string[] },
    user: User,
    count: number,
    emitFeed: boolean,
  ): void {
    if (result.streakBroken) {
      io.emit('ws:streak-broken');
    }

    if (result.streakIncreased) {
      const streak = streakManager.getCurrentStreak();
      const countries: string[] = [];
      const cities: string[] = [];
      const positions: Array<{ city: string; lat: number; lon: number }> = [];

      for (const uid of result.syncedUserIds) {
        const u = users.get(uid);
        if (u) {
          if (u.region) {
            const cc = u.region.split(', ').pop() || '';
            if (cc && !countries.includes(cc)) countries.push(cc);
          }
          if (u.city && !cities.includes(u.city)) {
            cities.push(u.city);
            if (u.lat !== 0 || u.lon !== 0) {
              positions.push({ city: u.city, lat: u.lat, lon: u.lon });
            }
          }
        }
      }

      let distanceKm: number | null = null;
      let cityPair: string | null = null;

      if (positions.length >= 2) {
        let maxDist = 0;
        let maxI = 0;
        let maxJ = 1;
        for (let i = 0; i < positions.length; i++) {
          for (let j = i + 1; j < positions.length; j++) {
            const d = haversineKm(
              positions[i].lat, positions[i].lon,
              positions[j].lat, positions[j].lon,
            );
            if (d > maxDist) {
              maxDist = d;
              maxI = i;
              maxJ = j;
            }
          }
        }
        if (maxDist > 1) {
          distanceKm = Math.round(maxDist);
          cityPair = `${positions[maxI].city} \u2194 ${positions[maxJ].city}`;
        }
      }

      statsManager.recordSync(cities, streak);
      worldState.addResonance(cities);

      // Award XP for sync
      awardSyncXP(result.syncedUserIds);

      io.emit('ws:burst', {
        streak,
        contributors: result.contributors,
        countries,
        userIds: result.syncedUserIds,
        cities,
        distanceKm,
        cityPair,
      });

      if (emitFeed) {
        io.emit('ws:feed', {
          type: 'sync',
          ordinal: user.ordinal,
          color: user.color,
          region: user.region,
          t: Date.now(),
          streak,
          countries,
        });
      }

      if (emitFeed && (streak % 5 === 0 || streak === streakManager.getBestStreak())) {
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

  // broadcast global stats every 10 seconds
  setInterval(() => {
    io.emit('ws:global-stats', buildGlobalStats());
  }, 10_000);

  // World state tick every 1s
  setInterval(() => {
    worldState.tick();
  }, 1000);

  // Broadcast world state every 2s
  setInterval(() => {
    const snapshot = worldState.getSnapshot();
    io.emit('ws:world-state', snapshot);

    const event = eventDirector.check(
      snapshot,
      streakManager.getCurrentStreak(),
      streakManager.getBestStreak(),
    );
    if (event) {
      io.emit('ws:world-event', event);
      console.log(`[event] ${event.type}: ${event.title}`);
    }
  }, 2000);

  // Leaderboard refresh every 60s
  if (leaderboardManager) {
    setInterval(() => {
      leaderboardManager.refreshAll().catch((err) => console.error('[leaderboard] refresh error:', err));
    }, 60_000);
    // Initial refresh
    leaderboardManager.refreshAll().catch(() => {});
  }

  // Territory tick every 2s + broadcast every 5s
  if (territoryManager) {
    setInterval(() => {
      territoryManager.tick().catch((err) => console.error('[territory] tick error:', err));
    }, 2000);

    setInterval(() => {
      const snapshot = territoryManager.getSnapshot();
      io.emit('ws:territory-update', snapshot);
    }, 5000);
  }

  // Narrator (AI narration + insights)
  if (config.narratorEnabled) {
    setInterval(async () => {
      const snapshot = worldState.getSnapshot();
      const count = connectedCount();
      const currentEvent = eventDirector.getCurrentEvent();

      const narration = await narrator.generateNarration(snapshot, count, currentEvent);
      if (narration) {
        io.emit('ws:narration', narration);
      }
    }, config.narratorIntervalMs);

    setInterval(async () => {
      const snapshot = worldState.getSnapshot();
      const totalEverEnergy = worldState.getTotalEnergyEver();

      const insight = await narrator.generateInsight(snapshot, totalEverEnergy);
      if (insight) {
        io.emit('ws:insight', insight);
      }
    }, 300_000);
  }

  io.on('connection', (socket) => {
    console.log(`[ws] socket connected: ${socket.id}`);

    // Extract auth from handshake
    const authPayload = extractAuthFromSocket(socket.handshake);

    socket.on('ws:join', async ({ color, userAgent, deviceId }) => {
      if (!HEX_COLOR.test(color)) {
        socket.emit('ws:error', { message: 'Invalid color format' });
        return;
      }

      const userId = nanoid();
      userOrdinalCounter += 1;
      const ip = extractIp(socket);
      const ua = userAgent || 'unknown';

      const geo = await resolveLocation(ip);
      const region = formatRegion(geo);

      // Resolve DB user if pool available
      let dbUserId: number | null = null;
      let isAuthenticated = false;
      let authUsername: string | null = null;
      let authAvatarUrl: string | null = null;

      if (pool) {
        if (authPayload) {
          dbUserId = authPayload.userId;
          isAuthenticated = true;
          // Fetch user details
          try {
            const { rows } = await pool.query(
              'SELECT username, avatar_url FROM users WHERE id = $1',
              [authPayload.userId],
            );
            if (rows.length > 0) {
              authUsername = rows[0].username;
              authAvatarUrl = rows[0].avatar_url;
            }
          } catch { /* ignore */ }
        } else if (deviceId) {
          try {
            dbUserId = await ensureDeviceUser(pool, deviceId, color);
          } catch (err) {
            console.error('[ws] failed to ensure device user:', err);
          }
        }
      }

      const user: User = {
        id: userId,
        ordinal: userOrdinalCounter,
        color,
        region,
        city: geo.city,
        lat: geo.lat,
        lon: geo.lon,
        createdAt: Date.now(),
        lastPulse: 0,
        lastColorChange: Date.now(),
        userAgent: ua,
        ip,
        dbUserId,
        lastXPTick: Date.now(),
        xpBuffer: 0,
        territoryId: 0,
        presenceSessionId: null,
        presenceEnergy: 0,
      };

      users.set(userId, user);

      // Create territory hierarchy and presence session
      if (territoryManager && geo.city && geo.country) {
        try {
          const tId = await territoryManager.ensureHierarchy(
            geo.city, geo.country, geo.region || '', geo.lat, geo.lon,
          );
          user.territoryId = tId;
        } catch (err) {
          console.error('[ws] territory hierarchy error:', err);
        }
      }

      // Update user location in DB
      if (pool && dbUserId && geo.city) {
        pool.query(
          'UPDATE users SET city = $1, lat = $2, lon = $3, last_seen_at = NOW() WHERE id = $4',
          [geo.city, geo.lat, geo.lon, dbUserId],
        ).catch(() => {});
      }

      // Start presence session
      if (pool && dbUserId) {
        try {
          const { rows: sessRows } = await pool.query(
            'INSERT INTO presence_sessions (user_id, city) VALUES ($1, $2) RETURNING id',
            [dbUserId, geo.city || null],
          );
          if (sessRows.length > 0) {
            user.presenceSessionId = sessRows[0].id;
          }
        } catch { /* ignore */ }
      }

      socket.data.userId = userId;
      socket.data.ordinal = userOrdinalCounter;
      socket.data.color = color;
      socket.data.userAgent = ua;
      socket.data.dbUserId = dbUserId;
      socket.data.isAuthenticated = isAuthenticated;
      socket.data.multipliers = null;

      // Load XP profile and multipliers
      let xpProfile = null;
      let multipliers = null;
      if (dbUserId && xpManager && upgradeManager) {
        try {
          // Record daily login and award bonus XP
          const loginResult = await xpManager.recordDailyLogin(dbUserId);
          if (loginResult.bonusXP > 0) {
            const xpResult = await xpManager.awardXP(dbUserId, loginResult.bonusXP);
            // Will send xp-update after joined
            setTimeout(() => {
              emitXPUpdate(socket, dbUserId!, xpResult);
            }, 500);
          }

          xpProfile = await xpManager.getProfile(dbUserId);
          multipliers = await upgradeManager.getUserMultipliers(dbUserId);
          socket.data.multipliers = multipliers;
        } catch (err) {
          console.error('[ws] failed to load XP/multipliers:', err);
        }
      }

      console.log(`[user] User${userOrdinalCounter} joined with ${color} from ${region || 'unknown'}${isAuthenticated ? ` (${authUsername})` : ''}${xpProfile ? ` Lv.${xpProfile.level}` : ''}`);

      const count = connectedCount();

      socket.emit('ws:joined', {
        ordinal: userOrdinalCounter,
        color,
        streak: streakManager.getCurrentStreak(),
        bestStreak: streakManager.getBestStreak(),
        syncRequired: streakManager.getState(count).requiredUsers,
        userCount: count,
        city: geo.city,
        globalStats: buildGlobalStats(),
        isAuthenticated,
        authUsername,
        authAvatarUrl,
        xp: xpProfile,
        multipliers,
      });

      if (multipliers) {
        socket.emit('ws:multipliers', multipliers);
      }

      io.emit('ws:user-count', { count });

      socket.emit('ws:world-state', worldState.getSnapshot());

      const currentEvent = eventDirector.getCurrentEvent();
      if (currentEvent) {
        socket.emit('ws:world-event', currentEvent);
      }

      const aiEnabled = !!(config.openaiApiKey && config.githubToken);
      socket.emit('ws:prompt-info', {
        freePromptsRemaining: getFreePromptsRemaining(ip),
        freePromptsTotal: config.promptFreeLimit,
        paidEnabled: !!config.stripeSecretKey,
      });
      if (aiEnabled) {
        if (dbProposalManager) {
          const proposals = await dbProposalManager.getActivePayloads(dbUserId);
          socket.emit('ws:proposals', { proposals });
        } else {
          socket.emit('ws:proposals', {
            proposals: fallbackProposalManager!.getActivePayloads(userId),
          });
        }
      }

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

      const energyMult = socket.data.multipliers?.energyMult ?? 1;
      const energy = 1.0 * energyMult;

      statsManager.recordPulse(user.city, now);
      worldState.addEnergy(user.city, user.lat, user.lon, energy);

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
        city: user.city,
        energy,
      });

      io.emit('ws:feed', {
        type: 'pulse',
        ordinal: user.ordinal,
        color: user.color,
        region: user.region,
        t: now,
      });

      handleStreakResult(result, user, count, true);
    });

    socket.on('ws:presence', async ({ x, y, vx, vy }) => {
      const userId = socket.data.userId;
      if (!userId) return;

      const user = users.get(userId);
      if (!user) return;

      const allowed = await checkPulseLimit(userId);
      if (!allowed) return;

      const now = Date.now();
      user.lastPulse = now;

      const speed = Math.sqrt(vx * vx + vy * vy);
      const baseEnergy = 0.3 + clamp01(speed) * 0.7;
      const energyMult = socket.data.multipliers?.energyMult ?? 1;
      const energy = baseEnergy * energyMult;

      statsManager.recordPulse(user.city, now);
      worldState.addEnergy(user.city, user.lat, user.lon, energy);

      // Feed territory system
      if (territoryManager && user.territoryId) {
        const cityEnergyMult = socket.data.multipliers?.cityEnergyMult ?? 1;
        territoryManager.addEnergy(user.territoryId, energy * cityEnergyMult);
        user.presenceEnergy += energy;
      }

      const count = connectedCount();
      const result = streakManager.addPulse(userId, now, count);

      // XP from presence: energy-based buffer + time-based ticks
      if (user.dbUserId && xpManager) {
        // Energy-based XP: accumulate fractional buffer
        user.xpBuffer += energy * XP_PER_ENERGY_UNIT;
        if (user.xpBuffer >= 1) {
          const xpAmount = Math.floor(user.xpBuffer);
          user.xpBuffer -= xpAmount;
          xpManager.awardXP(user.dbUserId, xpAmount).then((xpResult) => {
            emitXPUpdate(socket, user.dbUserId!, xpResult);
          }).catch(() => {});
        }

        // Time-based XP: 1 XP per minute of presence
        if (now - user.lastXPTick >= 60_000) {
          user.lastXPTick = now;
          xpManager.awardXP(user.dbUserId, XP_PER_PRESENCE_MINUTE).then((xpResult) => {
            emitXPUpdate(socket, user.dbUserId!, xpResult);
          }).catch(() => {});
        }
      }

      // NO broadcast of ws:pulse -- presence is silent to other clients
      // The city glows and world state broadcast handle visibility

      handleStreakResult(result, user, count, false);
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

    socket.on('ws:submit-prompt', async ({ prompt, paymentIntentId }) => {
      const userId = socket.data.userId;
      if (!userId) {
        socket.emit('ws:error', { message: 'Not authenticated' });
        return;
      }

      if (!config.openaiApiKey || !config.githubToken || !config.githubOwner || !config.githubRepo) {
        socket.emit('ws:error', { message: 'AI features not configured' });
        return;
      }

      const trimmed = prompt.trim();
      if (!trimmed || trimmed.length < 5 || trimmed.length > 500) {
        socket.emit('ws:error', { message: 'Prompt must be 5-500 characters' });
        return;
      }

      const allowed = await checkPromptRateLimit(userId);
      if (!allowed) {
        socket.emit('ws:error', { message: 'Too many prompts, slow down' });
        return;
      }

      const user = users.get(userId);
      if (!user) {
        socket.emit('ws:error', { message: 'User not found' });
        return;
      }

      const ip = user.ip;

      if (paymentIntentId && config.stripeSecretKey) {
        const valid = await verifyPaymentIntent(paymentIntentId);
        if (!valid) {
          socket.emit('ws:error', { message: 'Payment verification failed' });
          return;
        }
      } else {
        const freeCheck = checkFreePromptLimit(ip);
        if (!freeCheck.allowed) {
          socket.emit('ws:error', { message: 'Daily free prompt used. Pay $0.25 for more.' });
          return;
        }
        consumeFreePrompt(ip);
      }

      const proposalId = nanoid(10);

      if (dbProposalManager) {
        await dbProposalManager.createProposal(proposalId, trimmed, user.dbUserId, user.ordinal);
      } else {
        fallbackProposalManager!.createProposal(proposalId, trimmed, userId, user.ordinal);
      }

      socket.emit('ws:prompt-ack', {
        proposalId,
        freePromptsRemaining: getFreePromptsRemaining(ip),
      });

      const freshPayload = dbProposalManager
        ? await dbProposalManager.getPayload(proposalId, null)
        : fallbackProposalManager!.getPayload(proposalId, '');
      if (freshPayload) io.emit('ws:proposal-update', freshPayload);

      try {
        if (dbProposalManager) {
          await dbProposalManager.updateStatus(proposalId, 'generating');
        } else {
          fallbackProposalManager!.updateStatus(proposalId, 'generating');
        }
        const genPayload = dbProposalManager
          ? await dbProposalManager.getPayload(proposalId, null)
          : fallbackProposalManager!.getPayload(proposalId, '');
        if (genPayload) io.emit('ws:proposal-update', genPayload);

        console.log(`[ai] generating changes for proposal ${proposalId}: "${trimmed}"`);
        const result = await generateChanges(trimmed);

        if (result.changes.length === 0) {
          if (dbProposalManager) {
            await dbProposalManager.updateStatus(proposalId, 'failed', {
              error: result.reasoning || 'No changes generated',
            });
          } else {
            fallbackProposalManager!.updateStatus(proposalId, 'failed', {
              error: result.reasoning || 'No changes generated',
            });
          }
          const failPayload = dbProposalManager
            ? await dbProposalManager.getPayload(proposalId, null)
            : fallbackProposalManager!.getPayload(proposalId, '');
          if (failPayload) io.emit('ws:proposal-update', failPayload);
          return;
        }

        const prBody = [
          `## User Prompt`,
          `> ${trimmed}`,
          '',
          `## AI Reasoning`,
          result.reasoning,
          '',
          `## Changed Files`,
          ...result.changes.map((c) => `- \`${c.path}\``),
          '',
          `---`,
          `Proposed by User${user.ordinal} via Pulseboard AI`,
        ].join('\n');

        const pr = await createPR(
          result.changes,
          `[AI] ${result.summary}`,
          prBody,
          proposalId,
        );

        if (dbProposalManager) {
          await dbProposalManager.updateStatus(proposalId, 'pr-created', {
            summary: result.summary,
            reasoning: result.reasoning,
            changedFiles: result.changes.map((c) => c.path),
            prNumber: pr.prNumber,
            prUrl: pr.prUrl,
            branchName: pr.branchName,
          });
        } else {
          fallbackProposalManager!.updateStatus(proposalId, 'pr-created', {
            summary: result.summary,
            reasoning: result.reasoning,
            changedFiles: result.changes.map((c) => c.path),
            prNumber: pr.prNumber,
            prUrl: pr.prUrl,
            branchName: pr.branchName,
          });
        }

        const prPayload = dbProposalManager
          ? await dbProposalManager.getPayload(proposalId, null)
          : fallbackProposalManager!.getPayload(proposalId, '');
        if (prPayload) io.emit('ws:proposal-update', prPayload);
        console.log(`[ai] proposal ${proposalId} -> PR #${pr.prNumber}`);
      } catch (err) {
        console.error(`[ai] proposal ${proposalId} failed:`, err);
        if (dbProposalManager) {
          await dbProposalManager.updateStatus(proposalId, 'failed', {
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        } else {
          fallbackProposalManager!.updateStatus(proposalId, 'failed', {
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
        const errPayload = dbProposalManager
          ? await dbProposalManager.getPayload(proposalId, null)
          : fallbackProposalManager!.getPayload(proposalId, '');
        if (errPayload) io.emit('ws:proposal-update', errPayload);
      }
    });

    socket.on('ws:vote', async ({ proposalId, direction }) => {
      const userId = socket.data.userId;
      if (!userId) {
        socket.emit('ws:error', { message: 'Not authenticated' });
        return;
      }

      if (direction !== 'up' && direction !== 'down') {
        socket.emit('ws:error', { message: 'Invalid vote' });
        return;
      }

      // Gate voting behind GitHub auth when DB is available
      if (useDB && !socket.data.isAuthenticated) {
        socket.emit('ws:error', { message: 'Sign in with GitHub to vote' });
        return;
      }

      if (dbProposalManager && socket.data.dbUserId) {
        const result = await dbProposalManager.vote(proposalId, socket.data.dbUserId, direction);
        if (!result) {
          socket.emit('ws:error', { message: 'Proposal not found or not votable' });
          return;
        }

        const payload = await dbProposalManager.getPayload(proposalId, socket.data.dbUserId);
        if (payload) io.emit('ws:proposal-update', payload);

        const count = connectedCount();
        if (await dbProposalManager.shouldMerge(proposalId, count)) {
          try {
            if (payload?.prUrl) {
              const prNum = parseInt(payload.prUrl.split('/').pop() || '0');
              if (prNum > 0) {
                await mergePR(prNum);
                await dbProposalManager.updateStatus(proposalId, 'merged', { resolvedAt: Date.now() });
                const mergedPayload = await dbProposalManager.getPayload(proposalId, null);
                if (mergedPayload) io.emit('ws:proposal-update', mergedPayload);
                console.log(`[ai] proposal ${proposalId} merged via community vote`);
              }
            }
          } catch (err) {
            console.error(`[ai] merge failed for ${proposalId}:`, err);
          }
        } else if (await dbProposalManager.shouldReject(proposalId, count)) {
          try {
            if (payload?.prUrl) {
              const prNum = parseInt(payload.prUrl.split('/').pop() || '0');
              if (prNum > 0) await closePR(prNum);
            }
            await dbProposalManager.updateStatus(proposalId, 'rejected', { resolvedAt: Date.now() });
            const rejPayload = await dbProposalManager.getPayload(proposalId, null);
            if (rejPayload) io.emit('ws:proposal-update', rejPayload);
          } catch (err) {
            console.error(`[ai] reject failed for ${proposalId}:`, err);
          }
        }
      } else {
        // Fallback in-memory proposal manager
        const result = fallbackProposalManager!.vote(proposalId, userId, direction);
        if (!result) {
          socket.emit('ws:error', { message: 'Proposal not found or not votable' });
          return;
        }

        io.emit('ws:proposal-update', fallbackProposalManager!.getPayload(proposalId, '')!);

        const count = connectedCount();
        if (fallbackProposalManager!.shouldMerge(proposalId, count)) {
          try {
            const payload = fallbackProposalManager!.getPayload(proposalId, '')!;
            if (payload.prUrl) {
              const prNum = parseInt(payload.prUrl.split('/').pop() || '0');
              if (prNum > 0) {
                await mergePR(prNum);
                fallbackProposalManager!.updateStatus(proposalId, 'merged', { resolvedAt: Date.now() });
                io.emit('ws:proposal-update', fallbackProposalManager!.getPayload(proposalId, '')!);
              }
            }
          } catch (err) {
            console.error(`[ai] merge failed for ${proposalId}:`, err);
          }
        } else if (fallbackProposalManager!.shouldReject(proposalId, count)) {
          try {
            const payload = fallbackProposalManager!.getPayload(proposalId, '')!;
            if (payload.prUrl) {
              const prNum = parseInt(payload.prUrl.split('/').pop() || '0');
              if (prNum > 0) await closePR(prNum);
            }
            fallbackProposalManager!.updateStatus(proposalId, 'rejected', { resolvedAt: Date.now() });
            io.emit('ws:proposal-update', fallbackProposalManager!.getPayload(proposalId, '')!);
          } catch (err) {
            console.error(`[ai] reject failed for ${proposalId}:`, err);
          }
        }
      }
    });

    socket.on('ws:search-proposals', async ({ query, status, limit, offset }) => {
      if (!dbProposalManager) {
        socket.emit('ws:error', { message: 'Search requires database' });
        return;
      }
      try {
        const results = await dbProposalManager.search(query, status, limit || 20, offset || 0);
        socket.emit('ws:search-results', results);
      } catch (err) {
        console.error('[ws] search failed:', err);
        socket.emit('ws:error', { message: 'Search failed' });
      }
    });

    // --- Gamification handlers ---

    socket.on('ws:get-profile', async () => {
      const dbUserId = socket.data.dbUserId;
      if (!dbUserId || !pool || !xpManager || !upgradeManager) {
        socket.emit('ws:error', { message: 'Profile requires authentication' });
        return;
      }

      try {
        const xpProfile = await xpManager.getProfile(dbUserId);
        if (!xpProfile) {
          socket.emit('ws:error', { message: 'Profile not found' });
          return;
        }

        const userUpgrades = await upgradeManager.getUserUpgrades(dbUserId);
        const multipliers = await upgradeManager.getUserMultipliers(dbUserId);

        const { rows } = await pool.query(
          'SELECT username, display_name, avatar_url, color, created_at FROM users WHERE id = $1',
          [dbUserId],
        );
        if (rows.length === 0) return;
        const u = rows[0];

        const profile: UserProfilePayload = {
          userId: dbUserId,
          username: u.username,
          displayName: u.display_name,
          avatarUrl: u.avatar_url,
          color: u.color,
          xp: xpProfile,
          upgrades: userUpgrades,
          multipliers,
          stats: {
            totalEnergyContributed: Number(xpProfile.totalXP),
            citiesInfluenced: 0, // Will be richer in Phase 2
            syncsParticipated: 0,
            memberSince: new Date(u.created_at).getTime(),
          },
        };

        socket.emit('ws:profile', profile);
      } catch (err) {
        console.error('[ws] get-profile failed:', err);
        socket.emit('ws:error', { message: 'Failed to load profile' });
      }
    });

    socket.on('ws:get-upgrades', async () => {
      if (!upgradeManager) {
        socket.emit('ws:error', { message: 'Upgrades not available' });
        return;
      }
      try {
        const upgrades = await upgradeManager.getAvailableUpgrades();
        socket.emit('ws:upgrades-list', { upgrades });
      } catch (err) {
        console.error('[ws] get-upgrades failed:', err);
      }
    });

    socket.on('ws:purchase-upgrade', async ({ upgradeSlug }) => {
      const dbUserId = socket.data.dbUserId;
      if (!dbUserId || !upgradeManager || !xpManager) {
        socket.emit('ws:error', { message: 'Sign in to purchase upgrades' });
        return;
      }
      if (!socket.data.isAuthenticated) {
        socket.emit('ws:error', { message: 'Sign in with GitHub to purchase upgrades' });
        return;
      }

      try {
        const result = await upgradeManager.purchaseUpgrade(dbUserId, upgradeSlug, xpManager);
        if (result.success) {
          // Refresh multipliers
          const newMultipliers = await upgradeManager.getUserMultipliers(dbUserId);
          socket.data.multipliers = newMultipliers;
          socket.emit('ws:multipliers', newMultipliers);

          // Send updated XP
          const xpProfile = await xpManager.getProfile(dbUserId);
          if (xpProfile) {
            socket.emit('ws:xp-update', {
              xp: xpProfile.xp,
              totalXP: xpProfile.totalXP,
              level: xpProfile.level,
              xpToNextLevel: xpProfile.xpToNextLevel,
              leveledUp: false,
            });
          }
        }
        socket.emit('ws:upgrade-result', {
          success: result.success,
          error: result.error,
          upgrade: result.upgrade,
          newXP: result.xpSpent ? undefined : undefined,
        });
      } catch (err) {
        console.error('[ws] purchase-upgrade failed:', err);
        socket.emit('ws:upgrade-result', { success: false, error: 'Purchase failed' });
      }
    });

    socket.on('ws:get-leaderboard', async ({ type, limit }) => {
      if (!leaderboardManager) {
        socket.emit('ws:error', { message: 'Leaderboard not available' });
        return;
      }
      try {
        const entries = await leaderboardManager.getBoard(type, limit || 50);
        socket.emit('ws:leaderboard', { type, entries });
      } catch (err) {
        console.error('[ws] get-leaderboard failed:', err);
      }
    });

    socket.on('disconnect', () => {
      const userId = socket.data.userId;
      if (userId) {
        const user = users.get(userId);
        if (user) {
          console.log(`[user] User${user.ordinal} disconnected`);

          // End presence session
          if (pool && user.presenceSessionId) {
            pool.query(
              'UPDATE presence_sessions SET ended_at = NOW(), total_energy = $1 WHERE id = $2',
              [user.presenceEnergy, user.presenceSessionId],
            ).catch(() => {});
          }

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

  return {
    io,
    getStats,
    shutdown: () => {
      if (dbStatsManager) dbStatsManager.shutdown();
      else fallbackStatsManager?.shutdown();
      if (fallbackProposalManager) fallbackProposalManager.shutdown();
    },
  };
}
