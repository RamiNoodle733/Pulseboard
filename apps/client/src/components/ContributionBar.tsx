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

const PHASE_GLOWS: Record<string, string> = {
  surging: 'bg-amber-500',
  cooling: 'bg-blue-500',
  converging: 'bg-cyan-500',
  dormant: 'bg-zinc-600',
  active: 'bg-zinc-500',
};

export default function ContributionBar() {
  const sessionEnergy = useStore((s) => s.sessionEnergy);
  const myCity = useStore((s) => s.myCity);
  const worldState = useStore((s) => s.worldState);
  const userCount = useStore((s) => s.userCount);
  const insight = useStore((s) => s.insight);
  const level = useStore((s) => s.level);
  const xp = useStore((s) => s.xp);
  const xpToNextLevel = useStore((s) => s.xpToNextLevel);
  const isAuthenticated = useStore((s) => s.isAuthenticated);

  const myCityData = worldState?.cities.find((c) => c.city === myCity);
  const cityEnergy = myCityData?.energy ?? 0;
  const cityMomentum = myCityData?.momentum ?? 0;
  const totalEnergy = worldState?.totalEnergy ?? 0;
  const phaseName = worldState?.phase.name ?? 'active';
  const phaseColor = PHASE_COLORS[phaseName] || 'text-zinc-400';
  const phaseGlow = PHASE_GLOWS[phaseName] || 'bg-zinc-500';

  const momentumIcon = cityMomentum > 0.5 ? '\u2191' : cityMomentum < -0.5 ? '\u2193' : '\u00b7';
  const xpPercent = xpToNextLevel > 0 ? Math.min(100, (xp / xpToNextLevel) * 100) : 0;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-20 glass border-t border-white/[0.04]"
      style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom, 0.25rem))' }}
    >
      {insight && (
        <div className="text-center py-1 px-6">
          <span className="text-[11px] text-zinc-500 italic leading-tight">{insight}</span>
        </div>
      )}
      <div className="flex items-center justify-between px-4 py-2 text-[11px] tabular-nums font-mono">
        <div className="flex items-center gap-4">
          {isAuthenticated && (
            <span className="text-amber-400 font-semibold">
              Lv.{level}
              <span className="text-zinc-600 font-normal ml-1.5">
                {formatNum(xp)}<span className="text-zinc-700">/{formatNum(xpToNextLevel)}</span>
              </span>
            </span>
          )}
          <span className="text-zinc-500">
            you <span className="text-white font-medium">+{formatNum(sessionEnergy)}</span>
          </span>
          {myCity && (
            <span className="text-zinc-500">
              <span className="text-zinc-400">{myCity}</span>{' '}
              <span className="text-white font-medium">{formatNum(cityEnergy)}</span>
              <span className="text-zinc-600 ml-0.5">{momentumIcon}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className={`w-1 h-1 rounded-full ${phaseGlow} animate-pulse`} />
            <span className={`uppercase tracking-wider font-medium ${phaseColor}`}>
              {phaseName}
            </span>
          </span>
          <span className="text-zinc-500">
            <span className="text-white font-medium">{formatNum(totalEnergy)}</span>
            <span className="ml-1">energy</span>
          </span>
          <span className="text-zinc-600 flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500/70 animate-pulse" />
            {userCount}
          </span>
        </div>
      </div>
      {isAuthenticated && (
        <div className="px-4 pb-1.5">
          <div className="w-full h-[2px] bg-white/[0.03] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${xpPercent}%`,
                background: 'linear-gradient(90deg, rgba(245,158,11,0.4), rgba(251,191,36,0.6))',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
