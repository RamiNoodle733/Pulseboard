import { useState, useEffect } from 'react';
import { useStore } from '../store';

interface SessionStatsProps {
  onClose: () => void;
  onShare: () => void;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-zinc-700 text-[10px] uppercase tracking-wider">
        {label}
      </div>
      <div className="text-zinc-300 text-lg tabular-nums font-medium">
        {value}
      </div>
    </div>
  );
}

export default function SessionStats({ onClose, onShare }: SessionStatsProps) {
  const sessionStartTime = useStore((s) => s.sessionStartTime);
  const totalPulsesSent = useStore((s) => s.totalPulsesSent);
  const totalPulsesReceived = useStore((s) => s.totalPulsesReceived);
  const syncsParticipatedIn = useStore((s) => s.syncsParticipatedIn);
  const personalBestStreak = useStore((s) => s.personalBestStreak);
  const bestStreak = useStore((s) => s.bestStreak);
  const citySyncCounts = useStore((s) => s.citySyncCounts);

  const [, setTick] = useState(0);

  // Update elapsed time every second
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const duration = sessionStartTime > 0
    ? Math.floor((Date.now() - sessionStartTime) / 1000)
    : 0;
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;

  // Sort cities by sync count descending
  const topCities = Object.entries(citySyncCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="max-w-xs w-full mx-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-zinc-500 text-xs tracking-widest uppercase mb-6">
          session
        </p>

        <div className="grid grid-cols-2 gap-4 text-left mb-8">
          <Stat label="time" value={`${minutes}:${String(seconds).padStart(2, '0')}`} />
          <Stat label="pulses sent" value={totalPulsesSent} />
          <Stat label="pulses seen" value={totalPulsesReceived} />
          <Stat label="syncs" value={syncsParticipatedIn} />
          <Stat label="best streak" value={personalBestStreak} />
          <Stat label="world record" value={bestStreak} />
        </div>

        {/* City leaderboard */}
        {topCities.length > 0 && (
          <div className="mb-8">
            <p className="text-zinc-700 text-[10px] uppercase tracking-wider mb-3 text-left">
              top cities
            </p>
            <div className="space-y-1.5">
              {topCities.map(([city, count], i) => (
                <div
                  key={city}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-zinc-400">
                    <span className="text-zinc-700 mr-2">{i + 1}.</span>
                    {city}
                  </span>
                  <span className="text-zinc-600 tabular-nums">
                    {count} {count === 1 ? 'sync' : 'syncs'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-center">
          {personalBestStreak > 0 && (
            <button
              onClick={onShare}
              className="px-4 py-2 bg-white text-black text-xs rounded hover:bg-zinc-200 transition-colors"
            >
              share best moment
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-zinc-600 text-xs hover:text-zinc-400 transition-colors"
          >
            close
          </button>
        </div>
      </div>
    </div>
  );
}
