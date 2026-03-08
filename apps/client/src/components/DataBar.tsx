import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function DataBar() {
  const globalPulses = useStore((s) => s.globalPulses);
  const globalSyncs = useStore((s) => s.globalSyncs);
  const pulsesPerMinute = useStore((s) => s.pulsesPerMinute);
  const myCity = useStore((s) => s.myCity);
  const myCityRank = useStore((s) => s.myCityRank);
  const lastSyncDistance = useStore((s) => s.lastSyncDistance);
  const lastSyncCityPair = useStore((s) => s.lastSyncCityPair);
  const lastSyncDistanceTime = useStore((s) => s.lastSyncDistanceTime);
  const isAutoPulsing = useStore((s) => s.isAutoPulsing);

  // Smooth counter animation
  const displayRef = useRef(globalPulses);
  const [displayPulses, setDisplayPulses] = useState(globalPulses);

  useEffect(() => {
    let raf: number;
    const step = () => {
      const diff = globalPulses - displayRef.current;
      if (Math.abs(diff) < 1) {
        displayRef.current = globalPulses;
        setDisplayPulses(globalPulses);
        return;
      }
      displayRef.current += diff * 0.1;
      setDisplayPulses(Math.round(displayRef.current));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [globalPulses]);

  // Distance flash fade
  const [distanceOpacity, setDistanceOpacity] = useState(0);
  useEffect(() => {
    if (!lastSyncDistance || !lastSyncDistanceTime) return;
    setDistanceOpacity(1);
    const fadeTimer = setTimeout(() => setDistanceOpacity(0), 6000);
    return () => clearTimeout(fadeTimer);
  }, [lastSyncDistance, lastSyncDistanceTime]);

  const cityDisplay = myCity
    ? myCityRank > 0
      ? `${myCity} #${myCityRank}`
      : myCity
    : '';

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-20 pointer-events-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="bg-black/80 backdrop-blur-sm border-t border-zinc-800/50 px-3 py-1.5 flex items-center justify-between font-mono text-[10px] tabular-nums text-zinc-500">
        <div className="flex items-center gap-3">
          <span>
            <span className="text-zinc-400">{formatNum(displayPulses)}</span>{' '}
            pulses
          </span>
          <span className="text-zinc-700">|</span>
          <span>
            <span className="text-zinc-400">{formatNum(globalSyncs)}</span>{' '}
            syncs
          </span>
          <span className="text-zinc-700">|</span>
          <span>
            <span className="text-zinc-400">{pulsesPerMinute}</span>/min
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Sync distance flash */}
          {lastSyncCityPair && distanceOpacity > 0 && (
            <span
              className="text-emerald-400 transition-opacity duration-2000"
              style={{ opacity: distanceOpacity }}
            >
              {lastSyncCityPair} · {formatNum(lastSyncDistance!)} km
            </span>
          )}

          {isAutoPulsing && (
            <span className="text-zinc-700 animate-pulse">auto</span>
          )}

          {cityDisplay && (
            <span className="text-zinc-400">{cityDisplay}</span>
          )}
        </div>
      </div>
    </div>
  );
}
