import { useStore } from '../store';

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

const PHASE_COLORS: Record<string, string> = {
  surging: 'text-amber-400',
  cooling: 'text-blue-400',
  converging: 'text-cyan-400',
  dormant: 'text-zinc-600',
  active: 'text-zinc-400',
};

export default function ContributionBar() {
  const sessionEnergy = useStore((s) => s.sessionEnergy);
  const myCity = useStore((s) => s.myCity);
  const worldState = useStore((s) => s.worldState);
  const userCount = useStore((s) => s.userCount);
  const insight = useStore((s) => s.insight);

  const myCityData = worldState?.cities.find((c) => c.city === myCity);
  const cityEnergy = myCityData?.energy ?? 0;
  const cityMomentum = myCityData?.momentum ?? 0;
  const totalEnergy = worldState?.totalEnergy ?? 0;
  const phaseName = worldState?.phase.name ?? 'active';
  const phaseColor = PHASE_COLORS[phaseName] || 'text-zinc-400';

  const momentumArrow = cityMomentum > 0.5 ? '\u2191' : cityMomentum < -0.5 ? '\u2193' : '\u2192';

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-20 bg-black/60 backdrop-blur-sm border-t border-zinc-800/50"
      style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom, 0.25rem))' }}
    >
      {insight && (
        <div className="text-center py-0.5 px-4">
          <span className="text-xs text-zinc-500 italic">{insight}</span>
        </div>
      )}
      <div className="flex items-center justify-between px-3 py-1.5 text-sm tabular-nums font-mono">
        <div className="flex items-center gap-3">
          <span className="text-zinc-400">
            <span className="text-zinc-600">you</span>{' '}
            <span className="text-white">+{formatNum(sessionEnergy)}</span>
          </span>

          {myCity && (
            <span className="text-zinc-400">
              <span className="text-zinc-600">{myCity}</span>{' '}
              <span className="text-white">{formatNum(cityEnergy)}</span>
              <span className="text-zinc-500 ml-0.5">{momentumArrow}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className={`uppercase text-xs tracking-wider ${phaseColor}`}>
            {phaseName}
          </span>
          <span className="text-zinc-400">
            <span className="text-white">{formatNum(totalEnergy)}</span>
            <span className="text-zinc-600 ml-1">energy</span>
          </span>
          <span className="text-zinc-500 flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            {userCount}
          </span>
        </div>
      </div>
    </div>
  );
}
