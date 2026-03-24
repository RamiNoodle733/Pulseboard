import { useStore } from '../store';
import { getSocket } from '../socket';
import AuthButton from './AuthButton';

interface HUDProps {
  onColorEdit: () => void;
  onToggleProposals: () => void;
}

export default function HUD({ onColorEdit, onToggleProposals }: HUDProps) {
  const myColor = useStore((s) => s.myColor);
  const userCount = useStore((s) => s.userCount);
  const connected = useStore((s) => s.connected);
  const soundEnabled = useStore((s) => s.soundEnabled);
  const toggleSound = useStore((s) => s.toggleSound);
  const aiEnabled = useStore((s) => s.aiEnabled);
  const proposals = useStore((s) => s.proposals);
  const xp = useStore((s) => s.xp);
  const xpToNextLevel = useStore((s) => s.xpToNextLevel);
  const level = useStore((s) => s.level);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const setShowLeaderboard = useStore((s) => s.setShowLeaderboard);
  const setShowUpgradeShop = useStore((s) => s.setShowUpgradeShop);

  const activeProposals = proposals.filter((p) => p.status === 'pr-created' || p.status === 'generating').length;
  const xpPercent = xpToNextLevel > 0 ? Math.min(100, (xp / xpToNextLevel) * 100) : 0;

  return (
    <div
      className="absolute top-0 left-0 right-0 px-4 py-3 flex items-center justify-between pointer-events-none text-sm z-10"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0.75rem))' }}
    >
      {/* Left: color + auth + XP */}
      <div className="flex items-center gap-2.5 pointer-events-auto">
        <button
          onClick={onColorEdit}
          className="relative w-7 h-7 rounded-full border-2 border-white/10 hover:border-white/25 transition-all duration-200 hover:scale-110 group"
          style={{ backgroundColor: myColor }}
          title="Change color"
        >
          <span
            className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            style={{ boxShadow: `0 0 12px ${myColor}60` }}
          />
        </button>

        <AuthButton />

        {isAuthenticated && (
          <div className="flex items-center gap-1.5 ml-0.5">
            <span className="text-[10px] font-mono text-amber-400/70 tabular-nums">
              Lv.{level}
            </span>
            <div
              className="w-20 h-1.5 bg-white/[0.04] rounded-full overflow-hidden"
              title={`${Math.floor(xp)} / ${xpToNextLevel} XP`}
            >
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${xpPercent}%`,
                  background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Right: actions + status */}
      <div className="flex items-center gap-1 pointer-events-auto">
        {isAuthenticated && (
          <button
            onClick={() => { getSocket()?.emit('ws:get-upgrades'); setShowUpgradeShop(true); }}
            className="p-2 rounded-lg text-zinc-500 hover:text-amber-400 hover:bg-white/[0.04] transition-all duration-200"
            title="Upgrade Shop"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </button>
        )}
        <button
          onClick={() => setShowLeaderboard(true)}
          className="p-2 rounded-lg text-zinc-500 hover:text-amber-400 hover:bg-white/[0.04] transition-all duration-200"
          title="Leaderboard"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
          </svg>
        </button>
        {aiEnabled && (
          <button
            onClick={onToggleProposals}
            className="relative p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-all duration-200"
            title="Proposals"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18h6" />
              <path d="M10 22h4" />
              <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
            </svg>
            {activeProposals > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 animate-pulse-ring" />
            )}
          </button>
        )}
        <button
          onClick={toggleSound}
          className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-all duration-200"
          title={soundEnabled ? 'Mute' : 'Unmute'}
        >
          {soundEnabled ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          )}
        </button>

        <div className="flex items-center gap-2 ml-1 pl-2 border-l border-white/[0.06]">
          <span className="text-zinc-600 tabular-nums font-mono text-xs">{userCount}</span>
          <span
            className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
              connected ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]' : 'bg-red-500'
            }`}
          />
        </div>
      </div>
    </div>
  );
}
