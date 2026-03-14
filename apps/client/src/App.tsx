import { useEffect, useState, useCallback, useRef } from 'react';
import { initSocket, getSocket, getDeviceId } from './socket';
import type { FeedEntry, GlobalStatsPayload, ProposalPayload, WorldSnapshot, WorldEvent, UserProfilePayload, UserMultipliers, UpgradeDef, UserUpgrade, LeaderboardEntry, TerritorySnapshot } from './socket';
import { useStore } from './store';
import Canvas from './Canvas';
import HUD from './components/HUD';
import StreakDisplay from './components/StreakDisplay';
import ColorEditor from './components/ColorEditor';
import ShareCard from './components/ShareCard';
import ContributionBar from './components/ContributionBar';
import CityTicker from './components/CityTicker';
import PromptBar from './components/PromptBar';
import ProposalFeed from './components/ProposalFeed';
import EventBanner from './components/EventBanner';
import ProfilePanel from './components/ProfilePanel';
import UpgradeShop from './components/UpgradeShop';
import LeaderboardPanel from './components/LeaderboardPanel';
import LevelUpNotification from './components/LevelUpNotification';
import { playPulseHit, playBurstHit, playLevelUp, haptic, resumeAudio } from './audio';

const PRESETS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
];

const PRESENCE_INTERVAL = 200; // emit presence at 5Hz
const IDLE_PRESENCE_INTERVAL = 2000; // emit idle presence every 2s

export default function App() {
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [showColorEditor, setShowColorEditor] = useState(false);
  const dimensionsRef = useRef(dimensions);
  dimensionsRef.current = dimensions;

  const joined = useStore((s) => s.joined);
  const myColor = useStore((s) => s.myColor);
  const error = useStore((s) => s.error);
  const showShareCard = useStore((s) => s.showShareCard);
  const lastShareableSync = useStore((s) => s.lastShareableSync);
  const showProfile = useStore((s) => s.showProfile);
  const showUpgradeShop = useStore((s) => s.showUpgradeShop);
  const showLeaderboard = useStore((s) => s.showLeaderboard);
  const levelUpNotification = useStore((s) => s.levelUpNotification);

  // Handle OAuth token from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      localStorage.setItem('pulseboard:token', token);
      // Strip token from URL
      window.history.replaceState({}, '', window.location.pathname);
    }
    const authError = params.get('auth_error');
    if (authError) {
      useStore.getState().setError('Login failed: ' + authError);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Presence tracking refs
  const lastPosRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const presenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastEmitRef = useRef(0);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Activity level decay
  useEffect(() => {
    const iv = setInterval(() => useStore.getState().decayActivityLevel(), 100);
    return () => clearInterval(iv);
  }, []);

  // Unlock audio on first user interaction
  useEffect(() => {
    const unlock = () => {
      resumeAudio();
      useStore.getState().setAudioUnlocked();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('pointermove', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('pointermove', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('pointermove', unlock);
    };
  }, []);

  // Socket setup + auto-join
  useEffect(() => {
    const socket = initSocket();
    const store = useStore.getState;

    socket.on('connect', () => {
      store().setConnected(true);
      // Auto-join with random color
      if (!store().joined) {
        const color = PRESETS[Math.floor(Math.random() * PRESETS.length)];
        const deviceId = getDeviceId();
        socket.emit('ws:join', { color, userAgent: navigator.userAgent, deviceId });
      }
    });
    socket.on('disconnect', () => store().setConnected(false));

    socket.on(
      'ws:joined',
      ({ ordinal, color, streak, bestStreak: best, syncRequired, userCount: count, city, globalStats, isAuthenticated, authUsername, authAvatarUrl, xp, multipliers }) => {
        store().setJoined(ordinal, color, streak, best);
        store().setSyncRequired(syncRequired);
        store().setUserCount(count);
        if (city) store().setMyCity(city);
        if (globalStats) store().setGlobalStats(globalStats);
        store().setAuth(isAuthenticated, authUsername, authAvatarUrl);

        // Gamification data from join
        if (xp) {
          store().setXPUpdate({
            xp: xp.xp,
            totalXP: xp.totalXP,
            level: xp.level,
            xpToNextLevel: xp.xpToNextLevel,
            leveledUp: false,
          });
        }
        if (multipliers) {
          store().setMultipliers(multipliers);
        }
      },
    );

    socket.on('ws:pulse', ({ userId, color, t, ordinal, x, y, region, city, energy }) => {
      const d = dimensionsRef.current;
      const s = store();

      s.addPulse({
        id: `${userId}-${t}`,
        userId,
        color,
        x: x * d.width,
        y: y * d.height,
        t,
        ordinal,
        region,
        city: city || '',
        energy,
      });
      s.incrementPulsesReceived();
      s.updateActivityLevel(0.15 * energy);

      // Capture own userId from pulse echo
      if (s.myOrdinal !== null && ordinal === s.myOrdinal && !s.myUserId) {
        s.setMyUserId(userId);
        if (region) s.setMyRegion(region);
      }

      if (city) {
        s.addCityTick(city, color);
      }

      playPulseHit(s.soundEnabled, energy);
      haptic(Math.round(30 * energy));
    });

    socket.on('ws:burst', ({ streak, userIds, countries, cities, distanceKm, cityPair }) => {
      const s = store();
      s.updateStreak(streak, Math.max(streak, s.bestStreak));

      const syncEvent = { t: Date.now(), userIds, countries, cities: cities || [], streak };
      s.triggerBurst(syncEvent);
      s.setLastShareableSync(syncEvent);
      s.updateCitySyncCounts(cities || []);
      s.updateActivityLevel(0.4);

      if (distanceKm && cityPair) {
        s.setSyncDistance(distanceKm, cityPair);
      }

      if (s.myUserId && userIds.includes(s.myUserId)) {
        s.incrementSyncs();
      }

      playBurstHit(s.soundEnabled, streak);
      haptic([50, 30, 80]);

      if (streak >= 5) {
        s.setShowShareCard(true);
        setTimeout(() => useStore.getState().setShowShareCard(false), 5000);
      }
    });

    socket.on('ws:streak-broken', () => store().updateStreak(0));
    socket.on('ws:user-count', ({ count }) => store().setUserCount(count));
    socket.on('ws:color-changed', () => {});
    socket.on('ws:error', ({ message }) => store().setError(message));
    socket.on('ws:feed', (entry: FeedEntry) => store().addFeedEntry(entry));
    socket.on('ws:global-stats', (stats: GlobalStatsPayload) => store().setGlobalStats(stats));

    // World state events
    socket.on('ws:world-state', (snapshot: WorldSnapshot) => store().setWorldState(snapshot));
    socket.on('ws:world-event', (event: WorldEvent) => store().setCurrentEvent(event));
    socket.on('ws:narration', ({ text }) => {
      store().setNarration(text);
      setTimeout(() => useStore.getState().setNarration(null), 15000);
    });
    socket.on('ws:insight', ({ text }) => {
      store().setInsight(text);
      setTimeout(() => useStore.getState().setInsight(null), 10000);
    });

    // Proposal events
    socket.on('ws:proposals', ({ proposals }) => store().setProposals(proposals));
    socket.on('ws:proposal-update', (proposal: ProposalPayload) => store().upsertProposal(proposal));
    socket.on('ws:prompt-ack', ({ freePromptsRemaining }) => store().setFreePromptsRemaining(freePromptsRemaining));
    socket.on('ws:prompt-info', ({ freePromptsRemaining, freePromptsTotal, paidEnabled }) =>
      store().setPromptInfo(freePromptsRemaining, freePromptsTotal, paidEnabled),
    );

    socket.on('ws:search-results', () => {
      // Handled by ProposalFeed component directly
    });

    // Gamification events
    socket.on('ws:xp-update', (data: { xp: number; totalXP: number; level: number; xpToNextLevel: number; leveledUp: boolean }) => {
      const s = store();
      const prevLevel = s.level;
      s.setXPUpdate(data);
      if (data.leveledUp || data.level > prevLevel) {
        s.setLevelUpNotification(data.level);
        playLevelUp(s.soundEnabled);
        setTimeout(() => useStore.getState().clearLevelUpNotification(), 3500);
      }
    });

    socket.on('ws:multipliers', (data: UserMultipliers) => {
      store().setMultipliers(data);
    });

    socket.on('ws:profile', (data: UserProfilePayload) => {
      store().setProfileData(data);
    });

    socket.on('ws:upgrades-list', ({ upgrades }: { upgrades: UpgradeDef[] }) => {
      store().setAvailableUpgrades(upgrades);
    });

    socket.on('ws:upgrade-result', (data: { success: boolean; error?: string; upgrade?: UserUpgrade; newXP?: number }) => {
      if (data.success && data.upgrade) {
        const s = store();
        const current = s.myUpgrades;
        const idx = current.findIndex((u) => u.upgradeId === data.upgrade!.upgradeId);
        if (idx >= 0) {
          const updated = [...current];
          updated[idx] = data.upgrade;
          s.setMyUpgrades(updated);
        } else {
          s.setMyUpgrades([...current, data.upgrade]);
        }
      } else if (data.error) {
        store().setError(data.error);
      }
    });

    socket.on('ws:leaderboard', ({ type, entries }: { type: string; entries: LeaderboardEntry[] }) => {
      store().setLeaderboard(type, entries);
    });

    // Territory events
    socket.on('ws:territory-update', (data: TerritorySnapshot) => {
      store().setTerritoryData(data);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('ws:joined');
      socket.off('ws:pulse');
      socket.off('ws:burst');
      socket.off('ws:streak-broken');
      socket.off('ws:user-count');
      socket.off('ws:color-changed');
      socket.off('ws:error');
      socket.off('ws:feed');
      socket.off('ws:global-stats');
      socket.off('ws:world-state');
      socket.off('ws:world-event');
      socket.off('ws:narration');
      socket.off('ws:insight');
      socket.off('ws:proposals');
      socket.off('ws:proposal-update');
      socket.off('ws:prompt-ack');
      socket.off('ws:prompt-info');
      socket.off('ws:search-results');
      socket.off('ws:xp-update');
      socket.off('ws:multipliers');
      socket.off('ws:profile');
      socket.off('ws:upgrades-list');
      socket.off('ws:upgrade-result');
      socket.off('ws:leaderboard');
      socket.off('ws:territory-update');
    };
  }, []);

  // Presence emission: pointer move handler
  const handlePresence = useCallback((clientX: number, clientY: number) => {
    const socket = getSocket();
    if (!socket) return;

    const now = Date.now();
    if (now - lastEmitRef.current < PRESENCE_INTERVAL) return;

    const d = dimensionsRef.current;
    const nx = clientX / d.width;
    const ny = clientY / d.height;

    let vx = 0;
    let vy = 0;
    if (lastPosRef.current) {
      const dt = (now - lastPosRef.current.t) / 1000;
      if (dt > 0) {
        vx = (nx - lastPosRef.current.x) / dt;
        vy = (ny - lastPosRef.current.y) / dt;
      }
    }

    lastPosRef.current = { x: nx, y: ny, t: now };
    lastEmitRef.current = now;

    socket.emit('ws:presence', { x: nx, y: ny, vx, vy });

    // Add local ripple effect
    useStore.getState().addRipple(clientX, clientY);

    const speed = Math.sqrt(vx * vx + vy * vy);
    const energy = 0.3 + Math.min(1, speed) * 0.7;
    useStore.getState().incrementSessionEnergy(energy * 0.1);
  }, []);

  // Set up presence tracking via pointermove on the window
  useEffect(() => {
    if (!joined) return;

    const onPointerMove = (e: PointerEvent) => {
      handlePresence(e.clientX, e.clientY);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });

    // Idle presence: emit at low energy if pointer is static
    idleTimerRef.current = setInterval(() => {
      const socket = getSocket();
      if (!socket || !lastPosRef.current) return;

      const now = Date.now();
      const timeSinceEmit = now - lastEmitRef.current;

      if (timeSinceEmit >= IDLE_PRESENCE_INTERVAL) {
        const pos = lastPosRef.current;
        socket.emit('ws:presence', { x: pos.x, y: pos.y, vx: 0, vy: 0 });
        lastEmitRef.current = now;
        useStore.getState().incrementSessionEnergy(0.03);
      }
    }, IDLE_PRESENCE_INTERVAL);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      if (presenceTimerRef.current) clearInterval(presenceTimerRef.current);
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    };
  }, [joined, handlePresence]);

  const handleToggleProposals = useCallback(() => {
    const s = useStore.getState();
    s.setShowProposalFeed(!s.showProposalFeed);
  }, []);

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ touchAction: 'manipulation' }}
    >
      <Canvas
        width={dimensions.width}
        height={dimensions.height}
      />

      <HUD
        onColorEdit={() => setShowColorEditor(!showColorEditor)}
        onToggleProposals={handleToggleProposals}
      />
      <StreakDisplay />
      <EventBanner />

      {showColorEditor && (
        <ColorEditor
          currentColor={myColor}
          onClose={() => setShowColorEditor(false)}
        />
      )}

      {showShareCard && lastShareableSync && (
        <ShareCard
          streak={lastShareableSync.streak}
          cities={lastShareableSync.cities}
          onClose={() => useStore.getState().setShowShareCard(false)}
        />
      )}

      <PromptBar />
      <ProposalFeed />
      <CityTicker />
      <ContributionBar />

      {/* Gamification overlays */}
      {showProfile && <ProfilePanel />}
      {showUpgradeShop && <UpgradeShop />}
      {showLeaderboard && <LeaderboardPanel />}
      {levelUpNotification && <LevelUpNotification />}

      {error && (
        <div
          className="absolute bottom-14 left-1/2 -translate-x-1/2 z-30"
          style={{
            paddingBottom:
              'max(0.5rem, env(safe-area-inset-bottom, 0.5rem))',
          }}
        >
          <span className="text-red-400/80 text-sm bg-zinc-900/90 px-3 py-1.5 rounded-full border border-zinc-800">
            {error}
          </span>
        </div>
      )}
    </div>
  );
}
