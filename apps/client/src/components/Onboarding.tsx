import { useCallback } from 'react';
import { useStore } from '../store';
import Canvas from '../Canvas';
import { resumeAudio } from '../audio';

const PRESETS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
];

interface OnboardingProps {
  onJoin: (color: string) => void;
  width: number;
  height: number;
}

export default function Onboarding({ onJoin, width, height }: OnboardingProps) {
  const userCount = useStore((s) => s.userCount);
  const currentStreak = useStore((s) => s.currentStreak);

  const handleJoin = useCallback(() => {
    resumeAudio();
    const color = PRESETS[Math.floor(Math.random() * PRESETS.length)];
    onJoin(color);
  }, [onJoin]);

  return (
    <div className="fixed inset-0 bg-surface z-50">
      {/* Live canvas preview — shows other people's real-time pulses */}
      <Canvas
        width={width}
        height={height}
        onPulse={() => {}}
        previewMode
      />

      {/* Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <p className="text-zinc-500 text-sm tracking-[0.3em] uppercase mb-3 select-none">
          pulseboard
        </p>
        <p className="text-zinc-600 text-xs mb-6 select-none">
          tap anywhere. sync with strangers.
        </p>

        {userCount > 0 && (
          <p className="text-zinc-600 text-[11px] mb-4 tabular-nums select-none">
            {userCount} pulsing right now
            {currentStreak > 0 && <span> &middot; streak {currentStreak}</span>}
          </p>
        )}

        <button
          onClick={handleJoin}
          className="pointer-events-auto px-6 py-2.5 bg-white text-black text-sm rounded hover:bg-zinc-200 transition-colors active:scale-[0.97]"
        >
          start pulsing
        </button>
      </div>
    </div>
  );
}
