import { useEffect, useState, useCallback, useRef } from 'react';
import { initSocket, getSocket, FeedEntry } from './socket';
import { useStore } from './store';
import Canvas from './Canvas';
import ColorPicker from './ColorPicker';

// ---- audio ----

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function playPulseSound(color: string) {
  if (!useStore.getState().soundEnabled) return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const freq = 220 + (parseInt(color.slice(1, 3), 16) / 255) * 330;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch { /* audio not available */ }
}

function playBurstSound(streak: number) {
  if (!useStore.getState().soundEnabled) return;
  try {
    const ctx = getAudioCtx();
    // richer harmonics at higher streaks
    const baseFreqs = [260, 330, 390];
    const extra = Math.min(streak, 10);
    if (extra > 3) baseFreqs.push(520);
    if (extra > 6) baseFreqs.push(660);

    baseFreqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.03);
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.05, ctx.currentTime + i * 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4 + i * 0.03);
      osc.start(ctx.currentTime + i * 0.03);
      osc.stop(ctx.currentTime + 0.4 + i * 0.03);
    });
  } catch { /* audio not available */ }
}

function haptic(pattern: number | number[]) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// ---- feed ----

function timeAgo(t: number): string {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 2) return 'now';
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m`;
}

function Feed() {
  const entries = useStore((s) => s.feedEntries);
  const [, setTick] = useState(0);

  // re-render every second to update relative times
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  if (entries.length === 0) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0.75rem))' }}>
      <div className="mx-3 max-h-32 overflow-hidden flex flex-col-reverse">
        {entries.slice(0, 8).map((e, i) => (
          <div key={`${e.t}-${i}`} className="flex items-center gap-2 py-0.5 text-[11px]">
            {e.type === 'sync' ? (
              <span className="text-zinc-300">
                <span className="text-amber-400 mr-1">sync</span>
                {e.countries && e.countries.length > 0 ? e.countries.join(', ') : ''}{e.streak ? ` · streak ${e.streak}` : ''}
              </span>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: e.color }} />
                <span className="text-zinc-500">
                  user{e.ordinal}
                  {e.region ? ` · ${e.region}` : ''}
                </span>
              </>
            )}
            <span className="text-zinc-700 ml-auto flex-shrink-0">{timeAgo(e.t)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- color editor ----

function ColorEditor({ currentColor, onClose }: { currentColor: string; onClose: () => void }) {
  const [value, setValue] = useState(currentColor);

  const apply = () => {
    const socket = getSocket();
    if (socket && /^#[0-9A-Fa-f]{6}$/.test(value)) {
      socket.emit('ws:change-color', { color: value });
      useStore.getState().setMyColor(value);
      onClose();
    }
  };

  return (
    <div className="absolute top-12 left-4 z-50 bg-surface-raised border border-zinc-800 rounded-lg p-3 flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 p-0"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-20 px-2 py-1 bg-white/5 border border-zinc-800 rounded text-zinc-300 text-xs focus:border-zinc-600 focus:outline-none"
        spellCheck={false}
      />
      <button onClick={apply} className="px-2.5 py-1 bg-white/10 rounded text-zinc-300 text-xs hover:bg-white/20 transition-colors">
        Apply
      </button>
      <button onClick={onClose} className="text-zinc-600 text-xs hover:text-zinc-400 transition-colors ml-1">
        &times;
      </button>
    </div>
  );
}

// ---- main app ----

export default function App() {
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [showColorEditor, setShowColorEditor] = useState(false);
  const dimensionsRef = useRef(dimensions);
  dimensionsRef.current = dimensions;

  const {
    joined,
    connected,
    myColor,
    myOrdinal,
    currentStreak,
    bestStreak,
    userCount,
    error,
    soundEnabled,
    setJoined,
    setConnected,
    setUserCount,
    addPulse,
    updateStreak,
    triggerBurst,
    setError,
    setSyncRequired,
    addFeedEntry,
    toggleSound,
  } = useStore();

  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const socket = initSocket();

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('ws:joined', ({ ordinal, color, streak, bestStreak: best, syncRequired, userCount: count }) => {
      setJoined(ordinal, color, streak, best);
      setSyncRequired(syncRequired);
      setUserCount(count);
    });

    socket.on('ws:pulse', ({ userId, color, t, ordinal, x, y, region }) => {
      const d = dimensionsRef.current;
      addPulse({
        id: `${userId}-${t}`,
        userId,
        color,
        x: x * d.width,
        y: y * d.height,
        t,
        ordinal,
        region,
      });
      playPulseSound(color);
      haptic(30);
    });

    socket.on('ws:burst', ({ streak, userIds, countries }) => {
      updateStreak(streak, Math.max(streak, useStore.getState().bestStreak));
      triggerBurst({ t: Date.now(), userIds, countries, streak });
      playBurstSound(streak);
      haptic([50, 30, 80]);
    });

    socket.on('ws:streak-broken', () => {
      updateStreak(0);
    });

    socket.on('ws:user-count', ({ count }) => {
      setUserCount(count);
    });

    socket.on('ws:color-changed', () => {});

    socket.on('ws:error', ({ message }) => {
      setError(message);
    });

    socket.on('ws:feed', (entry: FeedEntry) => {
      addFeedEntry(entry);
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
    };
  }, []);

  const handleColorSelected = useCallback((color: string) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('ws:join', { color, userAgent: navigator.userAgent });
    }
  }, []);

  const handleCanvasClick = useCallback((nx: number, ny: number) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('ws:pulse', { x: nx, y: ny });
    }
  }, []);

  if (!joined) {
    return <ColorPicker onColorSelected={handleColorSelected} />;
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-surface" style={{ touchAction: 'manipulation' }}>
      <Canvas
        width={dimensions.width}
        height={dimensions.height}
        onPulse={handleCanvasClick}
      />

      {/* top bar */}
      <div className="absolute top-0 left-0 right-0 px-4 py-3 flex items-center justify-between text-xs pointer-events-none">
        <div className="pointer-events-auto">
          <button
            onClick={() => setShowColorEditor(!showColorEditor)}
            className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: myColor }} />
            <span>user{myOrdinal}</span>
          </button>
        </div>

        <div className="flex items-center gap-3 pointer-events-auto">
          <button
            onClick={toggleSound}
            className="text-zinc-600 hover:text-zinc-400 transition-colors"
            title={soundEnabled ? 'Mute' : 'Unmute'}
          >
            {soundEnabled ? '\u266A' : '\u266A'}
          </button>
          <span className="text-zinc-600">{userCount} online</span>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
        </div>
      </div>

      {showColorEditor && (
        <ColorEditor currentColor={myColor} onClose={() => setShowColorEditor(false)} />
      )}

      {/* streak counter */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none select-none">
        <div
          className="text-7xl sm:text-8xl font-bold tabular-nums transition-all duration-300"
          style={{
            color: currentStreak > 0 ? `rgba(255, 255, 255, ${Math.min(0.15 + currentStreak * 0.05, 0.6)})` : 'rgba(255, 255, 255, 0.04)',
            textShadow: currentStreak > 0 ? `0 0 ${Math.min(20 + currentStreak * 3, 60)}px rgba(255, 255, 255, ${Math.min(0.1 + currentStreak * 0.02, 0.3)})` : 'none',
          }}
        >
          {currentStreak}
        </div>
        {currentStreak > 0 && (
          <div className="text-zinc-600 text-xs mt-1">streak</div>
        )}
        {bestStreak > 0 && bestStreak !== currentStreak && (
          <div className="text-zinc-700 text-[10px] mt-0.5">best: {bestStreak}</div>
        )}
      </div>

      <Feed />

      {/* error toast */}
      {error && (
        <div className="absolute bottom-36 left-1/2 -translate-x-1/2">
          <span className="text-red-400/80 text-xs bg-surface-raised/90 px-3 py-1.5 rounded-full border border-zinc-800">
            {error}
          </span>
        </div>
      )}
    </div>
  );
}
