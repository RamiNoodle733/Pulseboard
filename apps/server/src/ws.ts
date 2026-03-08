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
  GlobalStatsPayload,
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
import { haversineKm } from './haversine.js';
import { generateChanges } from './ai.js';
import { createPR, mergePR, closePR } from './github.js';
import { createProposalManager } from './proposals.js';

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
  const statsManager = createStatsManager();
  const proposalManager = createProposalManager();
  statsManager.startAutoSave();
  proposalManager.startAutoSave();

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

  // auto-close expired proposals every 60 seconds
  setInterval(async () => {
    const expired = proposalManager.getExpiredProposals(config.proposalTtlMs);
    for (const p of expired) {
      if (p.prNumber) {
        await closePR(p.prNumber);
      }
      proposalManager.updateStatus(p.id, 'rejected', { resolvedAt: Date.now() });
      const payload = proposalManager.getPayload(p.id, '');
      if (payload) io.emit('ws:proposal-update', payload);
    }
  }, 60_000);

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
        city: geo.city,
        lat: geo.lat,
        lon: geo.lon,
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
        city: geo.city,
        globalStats: buildGlobalStats(),
      });

      io.emit('ws:user-count', { count });

      // Send AI feature info
      const aiEnabled = !!(config.anthropicApiKey && config.githubToken);
      socket.emit('ws:prompt-info', {
        freePromptsRemaining: getFreePromptsRemaining(ip),
        freePromptsTotal: config.promptFreeLimit,
        paidEnabled: !!config.stripeSecretKey,
      });
      if (aiEnabled) {
        socket.emit('ws:proposals', {
          proposals: proposalManager.getActivePayloads(userId),
        });
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

      statsManager.recordPulse(user.city, now);

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

        // collect countries and cities of synced users
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

        // calculate max haversine distance between any synced pair
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

        // record in persistent stats
        statsManager.recordSync(cities, streak);

        io.emit('ws:burst', {
          streak,
          contributors: result.contributors,
          countries,
          userIds: result.syncedUserIds,
          cities,
          distanceKm,
          cityPair,
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

    socket.on('ws:submit-prompt', async ({ prompt, paymentIntentId }) => {
      const userId = socket.data.userId;
      if (!userId) {
        socket.emit('ws:error', { message: 'Not authenticated' });
        return;
      }

      if (!config.anthropicApiKey || !config.githubToken || !config.githubOwner || !config.githubRepo) {
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
      proposalManager.createProposal(proposalId, trimmed, userId, user.ordinal);

      socket.emit('ws:prompt-ack', {
        proposalId,
        freePromptsRemaining: getFreePromptsRemaining(ip),
      });

      io.emit('ws:proposal-update', proposalManager.getPayload(proposalId, '')!);

      try {
        proposalManager.updateStatus(proposalId, 'generating');
        io.emit('ws:proposal-update', proposalManager.getPayload(proposalId, '')!);

        console.log(`[ai] generating changes for proposal ${proposalId}: "${trimmed}"`);
        const result = await generateChanges(trimmed);

        if (result.changes.length === 0) {
          proposalManager.updateStatus(proposalId, 'failed', {
            error: result.reasoning || 'No changes generated',
          });
          io.emit('ws:proposal-update', proposalManager.getPayload(proposalId, '')!);
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

        proposalManager.updateStatus(proposalId, 'pr-created', {
          summary: result.summary,
          reasoning: result.reasoning,
          changedFiles: result.changes.map((c) => c.path),
          prNumber: pr.prNumber,
          prUrl: pr.prUrl,
          branchName: pr.branchName,
        });

        io.emit('ws:proposal-update', proposalManager.getPayload(proposalId, '')!);
        console.log(`[ai] proposal ${proposalId} -> PR #${pr.prNumber}`);
      } catch (err) {
        console.error(`[ai] proposal ${proposalId} failed:`, err);
        proposalManager.updateStatus(proposalId, 'failed', {
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        io.emit('ws:proposal-update', proposalManager.getPayload(proposalId, '')!);
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

      const result = proposalManager.vote(proposalId, userId, direction);
      if (!result) {
        socket.emit('ws:error', { message: 'Proposal not found or not votable' });
        return;
      }

      io.emit('ws:proposal-update', proposalManager.getPayload(proposalId, '')!);

      const count = connectedCount();

      if (proposalManager.shouldMerge(proposalId, count)) {
        try {
          const payload = proposalManager.getPayload(proposalId, '')!;
          if (payload.prUrl) {
            const prNum = parseInt(payload.prUrl.split('/').pop() || '0');
            if (prNum > 0) {
              await mergePR(prNum);
              proposalManager.updateStatus(proposalId, 'merged', { resolvedAt: Date.now() });
              io.emit('ws:proposal-update', proposalManager.getPayload(proposalId, '')!);
              console.log(`[ai] proposal ${proposalId} merged via community vote`);
            }
          }
        } catch (err) {
          console.error(`[ai] merge failed for ${proposalId}:`, err);
        }
      } else if (proposalManager.shouldReject(proposalId, count)) {
        try {
          const payload = proposalManager.getPayload(proposalId, '')!;
          if (payload.prUrl) {
            const prNum = parseInt(payload.prUrl.split('/').pop() || '0');
            if (prNum > 0) {
              await closePR(prNum);
            }
          }
          proposalManager.updateStatus(proposalId, 'rejected', { resolvedAt: Date.now() });
          io.emit('ws:proposal-update', proposalManager.getPayload(proposalId, '')!);
        } catch (err) {
          console.error(`[ai] reject failed for ${proposalId}:`, err);
        }
      }
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

  return { io, getStats, shutdown: () => { statsManager.shutdown(); proposalManager.shutdown(); } };
}
