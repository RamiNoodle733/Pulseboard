import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';

const PHASE_COLORS: Record<string, string> = {
  surging: 'text-amber-500/60',
  cooling: 'text-blue-500/60',
  converging: 'text-cyan-500/60',
  dormant: 'text-zinc-700',
  active: 'text-zinc-700',
};

export default function StreakDisplay() {
  const currentStreak = useStore((s) => s.currentStreak);
  const bestStreak = useStore((s) => s.bestStreak);
  const showingBurst = useStore((s) => s.showingBurst);
  const worldState = useStore((s) => s.worldState);
  const [scale, setScale] = useState(1);
  const prevStreak = useRef(currentStreak);

  const phaseName = worldState?.phase.name ?? 'active';
  const phaseColor = PHASE_COLORS[phaseName] || 'text-zinc-700';

  // Pop-scale animation on streak increment
  useEffect(() => {
    if (currentStreak > prevStreak.current && currentStreak > 0) {
      setScale(1 + Math.min(currentStreak * 0.05, 0.4));
      const timer = setTimeout(() => setScale(1), 200);
      prevStreak.current = currentStreak;
      return () => clearTimeout(timer);
    }
    prevStreak.current = currentStreak;
  }, [currentStreak]);

  const textOpacity =
    currentStreak > 0
      ? Math.min(0.2 + currentStreak * 0.06, 0.8)
      : 0.04;

  const glowIntensity = Math.min(currentStreak * 0.04, 0.5);
  const glowRadius = currentStreak > 0 ? Math.min(30 + currentStreak * 5, 100) : 0;

  const fontSize =
    currentStreak > 10
      ? 'text-9xl'
      : currentStreak > 5
        ? 'text-8xl'
        : 'text-7xl';

  const burstOpacity = showingBurst
    ? Math.min(textOpacity + 0.2, 0.9)
    : textOpacity;

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none select-none z-0">
      <div
        className={`${fontSize} sm:text-8xl font-bold tabular-nums transition-all duration-150`}
        style={{
          color: `rgba(255, 255, 255, ${burstOpacity})`,
          textShadow:
            currentStreak > 0
              ? `0 0 ${glowRadius}px rgba(255, 255, 255, ${glowIntensity})`
              : 'none',
          transform: `scale(${scale})`,
        }}
      >
        {currentStreak}
      </div>
      {bestStreak > 0 && (
        <div className="text-zinc-800 text-[10px] mt-1 tabular-nums">
          peak resonance {bestStreak}
        </div>
      )}
      <div className={`text-[9px] mt-2 uppercase tracking-[0.25em] ${phaseColor}`}>
        {phaseName}
      </div>
    </div>
  );
}
