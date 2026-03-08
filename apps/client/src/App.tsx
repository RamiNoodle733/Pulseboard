import { useEffect, useState, useCallback, useRef } from 'react';
import { initSocket, getSocket } from './socket';
import type { FeedEntry, GlobalStatsPayload, ProposalPayload } from './socket';
import { useStore } from './store';
import Canvas from './Canvas';
import Onboarding from './components/Onboarding';
import HUD from './components/HUD';
import StreakDisplay from './components/StreakDisplay';
import ColorEditor from './components/ColorEditor';
import ShareCard from './components/ShareCard';
import DataBar from './components/DataBar';
import CityTicker from './components/CityTicker';
import PromptBar from './components/PromptBar';
import ProposalFeed from './components/ProposalFeed';
import { playPulseHit, playBurstHit, haptic } from './audio';

const AUTO_PULSE_IDLE_THRESHOLD = 5000; // 5s idle before auto-pulse
const AUTO_PULSE_INTERVAL_MIN = 8000;
const AUTO_PULSE_INTERVAL_MAX = 10000;

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

  // Interaction tracking for auto-pulse
  const lastInteractionRef = useRef(Date.now());
  const autoPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Track user interactions to reset idle timer
  useEffect(() => {
    const resetIdle = () => {
      lastInteractionRef.current = Date.now();
      useStore.getState().setIsAutoPulsing(false);
    };
    window.addEventListener('pointerdown', resetIdle);
    window.addEventListener('keydown', resetIdle);
    return () => {
      window.removeEventListener('pointerdown', resetIdle);
      window.removeEventListener('keydown', resetIdle);
    };
  }, []);

  // Auto-pulse system
  useEffect(() => {
    if (!joined) return;

    const scheduleAutoPulse = () => {
      const delay = AUTO_PULSE_INTERVAL_MIN + Math.random() * (AUTO_PULSE_INTERVAL_MAX - AUTO_PULSE_INTERVAL_MIN);
      autoPulseTimerRef.current = setTimeout(() => {
        const idleTime = Date.now() - lastInteractionRef.current;
        if (idleTime >= AUTO_PULSE_IDLE_THRESHOLD) {
          const socket = getSocket();
          if (socket) {
            // Random position avoiding edges (10%-90%)
            const x = 0.1 + Math.random() * 0.8;
            const y = 0.1 + Math.random() * 0.7; // avoid bottom DataBar area
            socket.emit('ws:pulse', { x, y });
            useStore.getState().incrementPulsesSent();
            useStore.getState().setIsAutoPulsing(true);
          }
        }
        scheduleAutoPulse();
      }, delay);
    };

    scheduleAutoPulse();
    return () => {
      if (autoPulseTimerRef.current) clearTimeout(autoPulseTimerRef.current);
    };
  }, [joined]);

  // Socket setup
  useEffect(() => {
    const socket = initSocket();
    const store = useStore.getState;

    socket.on('connect', () => store().setConnected(true));
    socket.on('disconnect', () => store().setConnected(false));

    socket.on(
      'ws:joined',
      ({ ordinal, color, streak, bestStreak: best, syncRequired, userCount: count, city, globalStats }) => {
        store().setJoined(ordinal, color, streak, best);
        store().setSyncRequired(syncRequired);
        store().setUserCount(count);
        if (city) store().setMyCity(city);
        if (globalStats) store().setGlobalStats(globalStats);
      },
    );

    socket.on('ws:pulse', ({ userId, color, t, ordinal, x, y, region, city }) => {
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
      });
      s.incrementPulsesReceived();
      s.updateActivityLevel(0.15);

      // Capture own userId from pulse echo
      if (s.myOrdinal !== null && ordinal === s.myOrdinal && !s.myUserId) {
        s.setMyUserId(userId);
        if (region) s.setMyRegion(region);
      }

      // Add to city ticker
      if (city) {
        s.addCityTick(city, color);
      }

      playPulseHit(s.soundEnabled);
      haptic(30);
    });

    socket.on('ws:burst', ({ streak, userIds, countries, cities, distanceKm, cityPair }) => {
      const s = store();
      s.updateStreak(streak, Math.max(streak, s.bestStreak));

      const syncEvent = { t: Date.now(), userIds, countries, cities: cities || [], streak };
      s.triggerBurst(syncEvent);
      s.setLastShareableSync(syncEvent);
      s.updateCitySyncCounts(cities || []);
      s.updateActivityLevel(0.4);

      // Set sync distance if present
      if (distanceKm && cityPair) {
        s.setSyncDistance(distanceKm, cityPair);
      }

      // Check if current user participated
      if (s.myUserId && userIds.includes(s.myUserId)) {
        s.incrementSyncs();
      }

      playBurstHit(s.soundEnabled, streak);
      haptic([50, 30, 80]);

      // Auto-show share card for notable streaks
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

    // Proposal events
    socket.on('ws:proposals', ({ proposals }) => store().setProposals(proposals));
    socket.on('ws:proposal-update', (proposal: ProposalPayload) => store().upsertProposal(proposal));
    socket.on('ws:prompt-ack', ({ freePromptsRemaining }) => store().setFreePromptsRemaining(freePromptsRemaining));
    socket.on('ws:prompt-info', ({ freePromptsRemaining, freePromptsTotal, paidEnabled }) =>
      store().setPromptInfo(freePromptsRemaining, freePromptsTotal, paidEnabled),
    );

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
      socket.off('ws:proposals');
      socket.off('ws:proposal-update');
      socket.off('ws:prompt-ack');
      socket.off('ws:prompt-info');
    };
  }, []);

  const handleJoin = useCallback((color: string) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('ws:join', { color, userAgent: navigator.userAgent });
    }
  }, []);

  const handleCanvasClick = useCallback((nx: number, ny: number) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('ws:pulse', { x: nx, y: ny });
      useStore.getState().incrementPulsesSent();
      lastInteractionRef.current = Date.now();
      useStore.getState().setIsAutoPulsing(false);
    }
  }, []);

  const handleToggleProposals = useCallback(() => {
    const s = useStore.getState();
    s.setShowProposalFeed(!s.showProposalFeed);
  }, []);

  if (!joined) {
    return (
      <Onboarding
        onJoin={handleJoin}
        width={dimensions.width}
        height={dimensions.height}
      />
    );
  }

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ touchAction: 'manipulation' }}
    >
      <Canvas
        width={dimensions.width}
        height={dimensions.height}
        onPulse={handleCanvasClick}
      />

      <HUD
        onColorEdit={() => setShowColorEditor(!showColorEditor)}
        onToggleProposals={handleToggleProposals}
      />
      <StreakDisplay />

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
      <DataBar />

      {error && (
        <div
          className="absolute bottom-14 left-1/2 -translate-x-1/2 z-30"
          style={{
            paddingBottom:
              'max(0.5rem, env(safe-area-inset-bottom, 0.5rem))',
          }}
        >
          <span className="text-red-400/80 text-xs bg-zinc-900/90 px-3 py-1.5 rounded-full border border-zinc-800">
            {error}
          </span>
        </div>
      )}
    </div>
  );
}
