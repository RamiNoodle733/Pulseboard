import { useEffect, useState, useCallback } from 'react';
import { initSocket, getSocket } from './socket';
import { useStore } from './store';
import Canvas from './Canvas';
import ColorPicker from './ColorPicker';

export default function App() {
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const {
    joined,
    connected,
    myColor,
    myOrdinal,
    currentStreak,
    bestStreak,
    userCount,
    error,
    canPulse,
    setJoined,
    setConnected,
    setUserCount,
    addPulse,
    updateStreak,
    triggerBurst,
    setError,
    setCanPulse,
  } = useStore();

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize socket
  useEffect(() => {
    const socket = initSocket();

    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('ws:joined', ({ ordinal, color, streak, bestStreak }) => {
      setJoined(ordinal, color, streak, bestStreak);
    });

    socket.on('ws:pulse', ({ userId, color, t, ordinal }) => {
      addPulse({
        id: `${userId}-${t}`,
        userId,
        color,
        x: Math.random() * dimensions.width,
        y: Math.random() * dimensions.height,
        t,
        ordinal,
      });
    });

    socket.on('ws:burst', ({ streak }) => {
      updateStreak(streak, Math.max(streak, bestStreak));
      triggerBurst();
    });

    socket.on('ws:streak-broken', () => {
      updateStreak(0);
    });

    socket.on('ws:user-count', ({ count }) => {
      setUserCount(count);
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
      socket.off('ws:error');
    };
  }, []);

  // Handle color selection
  const handleColorSelected = useCallback((color: string) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('ws:join', { color });
    }
  }, []);

  // Handle pulse
  const handlePulse = useCallback(() => {
    if (!canPulse) return;

    const socket = getSocket();
    if (socket) {
      socket.emit('ws:pulse');
      
      // Cooldown feedback
      setCanPulse(false);
      setTimeout(() => setCanPulse(true), 3000);
    }
  }, [canPulse, setCanPulse]);

  // Keyboard support
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === 'Space' && joined && canPulse) {
        e.preventDefault();
        handlePulse();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [joined, canPulse, handlePulse]);

  if (!joined) {
    return <ColorPicker onColorSelected={handleColorSelected} />;
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      {/* Canvas Background */}
      <Canvas width={dimensions.width} height={dimensions.height} />

      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between">
        <div className="glass px-4 py-2 rounded-full flex items-center gap-3">
          <div
            className="w-4 h-4 rounded-full animate-pulse-dot"
            style={{ backgroundColor: myColor }}
          />
          <span className="font-semibold">User{myOrdinal}</span>
        </div>

        <div className="glass px-4 py-2 rounded-full flex items-center gap-2">
          <span className="text-white/60 text-sm">Online:</span>
          <span className="font-semibold">{userCount}</span>
        </div>

        <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
      </div>

      {/* Center Streak Display */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
        <div className="animate-float">
          <div className="text-8xl font-bold mb-2">{currentStreak}</div>
          <div className="text-white/60 text-sm">Current Streak</div>
          {bestStreak > 0 && (
            <div className="text-white/40 text-xs mt-1">Best: {bestStreak}</div>
          )}
        </div>
      </div>

      {/* Bottom Pulse Button */}
      <div className="absolute bottom-0 left-0 right-0 p-8 flex flex-col items-center gap-4">
        <button
          onClick={handlePulse}
          disabled={!canPulse}
          className={`w-24 h-24 rounded-full font-bold text-xl transition-all ${
            canPulse
              ? 'hover:scale-110 active:scale-95 shadow-2xl cursor-pointer'
              : 'opacity-50 cursor-not-allowed scale-90'
          }`}
          style={{
            backgroundColor: myColor,
            boxShadow: canPulse ? `0 0 40px ${myColor}` : 'none',
          }}
        >
          PULSE
        </button>
        <p className="text-white/40 text-sm">
          {canPulse ? 'Click or press SPACE' : 'Cooldown...'}
        </p>
      </div>

      {/* Error Toast */}
      {error && (
        <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2">
          <div className="glass px-6 py-3 rounded-lg text-red-400 font-medium">
            {error}
          </div>
        </div>
      )}

      {/* Instructions (first time) */}
      {currentStreak === 0 && (
        <div className="absolute top-24 left-1/2 transform -translate-x-1/2 max-w-md">
          <div className="glass px-6 py-4 rounded-lg text-center text-sm text-white/60">
            <p className="mb-2">
              Tap <span className="font-bold text-white">PULSE</span> to send your color into the
              timeline
            </p>
            <p>
              Sync with <span className="font-bold text-white">8+ users</span> within 600ms to
              build the streak!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
