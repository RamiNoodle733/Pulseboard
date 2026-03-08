import { useEffect, useState, useCallback, useRef } from 'react';
import { initSocket, getSocket } from './socket';
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
    const freq = 200 + (parseInt(color.slice(1, 3), 16) / 255) * 400;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch { /* audio not available */ }
}

function playBurstSound() {
  if (!useStore.getState().soundEnabled) return;
  try {
    const ctx = getAudioCtx();
    [300, 450, 600].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.05);
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.06, ctx.currentTime + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3 + i * 0.05);
      osc.start(ctx.currentTime + i * 0.05);
      osc.stop(ctx.currentTime + 0.3 + i * 0.05);
    });
  } catch { /* audio not available */ }
}

function haptic(pattern: number | number[]) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// ---- sync indicator ----

function SyncIndicator() {
  const syncWindowEnd = useStore((s) => s.syncWindowEnd);
  const syncContributors = useStore((s) => s.syncContributors);
  const syncRequired = useStore((s) => s.syncRequired);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!syncWindowEnd) return;
    let raf: number;
    const tick = () => {
      const ms = Math.max(0, syncWindowEnd - Date.now());
      setRemaining(ms);
      if (ms > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [syncWindowEnd]);

  if (!syncWindowEnd || syncContributors === 0) return null;

  const progress = syncRequired > 0 ? Math.min(syncContributors / syncRequired, 1) : 0;
  const barLen = 10;
  const filled = Math.round(progress * barLen);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barLen - filled);
  const synced = syncContributors >= syncRequired;

  return (
    <div className={`text-xs font-mono transition-colors ${synced ? 'text-terminal-green text-glow' : 'text-zinc-500'}`}>
      SYNC [{syncContributors}/{syncRequired}] {bar} {remaining > 0 ? `${remaining}ms` : ''}
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
    <div className="absolute top-12 left-4 z-50 panel p-3 flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-6 h-6 cursor-pointer bg-transparent border-0 p-0"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-20 px-2 py-1 bg-transparent border border-zinc-800 text-zinc-300 text-xs font-mono focus:border-zinc-600 focus:outline-none"
        spellCheck={false}
      />
      <button onClick={apply} className="px-2 py-1 border border-zinc-700 text-zinc-400 text-xs hover:text-zinc-200 hover:border-zinc-500 transition-colors">
        apply
      </button>
      <button onClick={onClose} className="text-zinc-600 text-xs hover:text-zinc-400 transition-colors">
        x
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
    setSyncState,
    setSyncRequired,
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

    socket.on('ws:joined', ({ ordinal, color, streak, bestStreak: best, syncRequired }) => {
      setJoined(ordinal, color, streak, best);
      setSyncRequired(syncRequired);
    });

    socket.on('ws:pulse', ({ userId, color, t, ordinal, x, y }) => {
      const d = dimensionsRef.current;
      addPulse({
        id: `${userId}-${t}`,
        userId,
        color,
        x: x * d.width,
        y: y * d.height,
        t,
        ordinal,
      });
      playPulseSound(color);
      haptic(30);
    });

    socket.on('ws:burst', ({ streak }) => {
      updateStreak(streak, Math.max(streak, useStore.getState().bestStreak));
      triggerBurst();
      playBurstSound();
      haptic([50, 30, 80]);
    });

    socket.on('ws:streak-broken', () => {
      updateStreak(0);
    });

    socket.on('ws:user-count', ({ count }) => {
      setUserCount(count);
    });

    socket.on('ws:sync-state', ({ windowEnd, contributors, required }) => {
      setSyncState(windowEnd, contributors, required);
    });

    socket.on('ws:color-changed', () => {
      // color changes are handled optimistically in ColorEditor
    });

    socket.on('ws:error', ({ message }) => {
      setError(message);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('ws:joined');
      socket.off('ws:pulse');
      socket.off('ws:burst');
      socket.off('ws:streak-broken');
      socket.off('ws:user-count');
      socket.off('ws:sync-state');
      socket.off('ws:color-changed');
      socket.off('ws:error');
    };
  }, []);

  const handleColorSelected = useCallback((color: string) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('ws:join', { color, userAgent: navigator.userAgent });
    }
  }, []);

  const handlePulse = useCallback(() => {
    const socket = getSocket();
    if (socket) {
      socket.emit('ws:pulse');
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && joined) {
        e.preventDefault();
        handlePulse();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [joined, handlePulse]);

  if (!joined) {
    return <ColorPicker onColorSelected={handleColorSelected} />;
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-surface scanlines" style={{ touchAction: 'manipulation' }}>
      <Canvas width={dimensions.width} height={dimensions.height} />

      {/* top bar */}
      <div className="absolute top-0 left-0 right-0 px-4 py-3 flex items-center justify-between text-xs">
        <button
          onClick={() => setShowColorEditor(!showColorEditor)}
          className="flex items-center gap-2 hover:text-zinc-100 transition-colors"
        >
          <span className="w-3 h-3 inline-block" style={{ backgroundColor: myColor }} />
          <span className="text-zinc-400">[user{myOrdinal}]</span>
        </button>

        <div className="flex items-center gap-4">
          <button
            onClick={toggleSound}
            className="text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            [{soundEnabled ? 'SND' : 'MUTE'}]
          </button>
          <span className="text-zinc-600">online: <span className="text-zinc-400">{userCount}</span></span>
          <span className={`status-dot ${connected ? 'status-dot--online' : 'status-dot--offline'}`} />
        </div>
      </div>

      {showColorEditor && (
        <ColorEditor currentColor={myColor} onClose={() => setShowColorEditor(false)} />
      )}

      {/* center streak */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none select-none">
        <div className={`text-7xl sm:text-8xl font-bold mb-1 tabular-nums ${currentStreak > 0 ? 'text-terminal-green text-glow' : 'text-zinc-800'}`}>
          {String(currentStreak).padStart(3, '0')}
        </div>
        <div className="text-zinc-600 text-xs uppercase tracking-widest">current streak</div>
        {bestStreak > 0 && (
          <div className="text-zinc-700 text-[10px] mt-1">best: {bestStreak}</div>
        )}
      </div>

      {/* bottom area */}
      <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-3" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 2rem))' }}>
        <SyncIndicator />

        <button
          onClick={handlePulse}
          className="w-20 h-20 sm:w-24 sm:h-24 border-2 font-bold text-sm uppercase tracking-wider transition-all hover:scale-105 active:scale-95 cursor-pointer"
          style={{
            borderColor: myColor,
            color: myColor,
            boxShadow: `0 0 30px ${myColor}30`,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${myColor}15`; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          pulse
        </button>

        <p className="text-zinc-700 text-[10px]">[SPACE] or tap</p>
      </div>

      {/* error toast */}
      {error && (
        <div className="absolute bottom-36 left-1/2 -translate-x-1/2">
          <span className="text-terminal-red text-xs">[error] {error}</span>
        </div>
      )}

      {/* instructions */}
      {currentStreak === 0 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 max-w-sm">
          <p className="text-zinc-600 text-[10px] text-center">
            {'> '}sync with <span className="text-zinc-400">{useStore.getState().syncRequired}+ users</span> within 600ms to build the streak
          </p>
        </div>
      )}
    </div>
  );
}
