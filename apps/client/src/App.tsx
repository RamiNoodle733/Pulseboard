import { useEffect, useState, useCallback, useRef } from 'react';
import { initSocket, getSocket } from './socket';
import type { FeedEntry } from './socket';
import { useStore } from './store';
import Canvas from './Canvas';
import Onboarding from './components/Onboarding';
import HUD from './components/HUD';
import StreakDisplay from './components/StreakDisplay';
import ColorEditor from './components/ColorEditor';
import SessionStats from './components/SessionStats';
import ShareCard from './components/ShareCard';
import { playPulseHit, playBurstHit, haptic } from './audio';

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
  const showStats = useStore((s) => s.showStats);
  const showShareCard = useStore((s) => s.showShareCard);
  const lastShareableSync = useStore((s) => s.lastShareableSync);

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

  // Socket setup
  useEffect(() => {
    const socket = initSocket();
    const store = useStore.getState;

    socket.on('connect', () => store().setConnected(true));
    socket.on('disconnect', () => store().setConnected(false));

    socket.on(
      'ws:joined',
      ({ ordinal, color, streak, bestStreak: best, syncRequired, userCount: count }) => {
        store().setJoined(ordinal, color, streak, best);
        store().setSyncRequired(syncRequired);
        store().setUserCount(count);
      },
    );

    socket.on('ws:pulse', ({ userId, color, t, ordinal, x, y, region }) => {
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
      });
      s.incrementPulsesReceived();
      s.updateActivityLevel(0.15);

      // Capture own userId from pulse echo
      if (s.myOrdinal !== null && ordinal === s.myOrdinal && !s.myUserId) {
        s.setMyUserId(userId);
        if (region) s.setMyRegion(region);
      }

      playPulseHit(s.soundEnabled);
      haptic(30);
    });

    socket.on('ws:burst', ({ streak, userIds, countries }) => {
      const s = store();
      s.updateStreak(streak, Math.max(streak, s.bestStreak));

      // Resolve city names from synced users' pulses
      const cities: string[] = [];
      for (const uid of userIds) {
        for (let i = s.pulses.length - 1; i >= 0; i--) {
          if (s.pulses[i].userId === uid && s.pulses[i].region) {
            const city = s.pulses[i].region.split(', ')[0];
            if (city && !cities.includes(city)) cities.push(city);
            break;
          }
        }
      }

      const syncEvent = { t: Date.now(), userIds, countries, cities, streak };
      s.triggerBurst(syncEvent);
      s.setLastShareableSync(syncEvent);
      s.updateCitySyncCounts(cities);
      s.updateActivityLevel(0.4);

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
    }
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

      <HUD onColorEdit={() => setShowColorEditor(!showColorEditor)} />
      <StreakDisplay />

      {showColorEditor && (
        <ColorEditor
          currentColor={myColor}
          onClose={() => setShowColorEditor(false)}
        />
      )}

      {showStats && (
        <SessionStats
          onClose={() => useStore.getState().setShowStats(false)}
          onShare={() => {
            useStore.getState().setShowStats(false);
            useStore.getState().setShowShareCard(true);
          }}
        />
      )}

      {showShareCard && lastShareableSync && (
        <ShareCard
          streak={lastShareableSync.streak}
          cities={lastShareableSync.cities}
          onClose={() => useStore.getState().setShowShareCard(false)}
        />
      )}

      {error && (
        <div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30"
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
