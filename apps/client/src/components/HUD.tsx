import { useStore } from '../store';
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
      {/* Left: color dot + auth + XP bar */}
      <div className="flex items-center gap-3 pointer-events-auto">
        <button
          onClick={onColorEdit}
          className="w-6 h-6 rounded-full border border-zinc-800 hover:scale-110 transition-transform"
          style={{ backgroundColor: myColor }}
        />
        <AuthButton />
        {isAuthenticated && (
          <div className="flex items-center gap-1.5">
            <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden" title={`${Math.floor(xp)} / ${xpToNextLevel} XP to Lv.${level + 1}`}>
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                style={{ width: `${xpPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Right: leaderboard, upgrades, proposals, mute, count, status */}
      <div className="flex items-center gap-3 pointer-events-auto">
        {isAuthenticated && (
          <button
            onClick={() => setShowUpgradeShop(true)}
            className="text-zinc-600 hover:text-amber-400 transition-colors"
            title="Upgrade Shop"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </button>
        )}
        <button
          onClick={() => setShowLeaderboard(true)}
          className="text-zinc-600 hover:text-amber-400 transition-colors"
          title="Leaderboard"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            className="relative text-zinc-600 hover:text-zinc-400 transition-colors"
            title="Proposals"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18h6" />
              <path d="M10 22h4" />
              <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
            </svg>
            {activeProposals > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500" />
            )}
          </button>
        )}
        <button
          onClick={toggleSound}
          className="text-zinc-600 hover:text-zinc-400 transition-colors"
          title={soundEnabled ? 'Mute' : 'Unmute'}
        >
          {soundEnabled ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          )}
        </button>
        <span className="text-zinc-700 tabular-nums">{userCount}</span>
        <span
          className={`w-2 h-2 rounded-full ${
            connected ? 'bg-emerald-600' : 'bg-red-600'
          }`}
        />
      </div>
    </div>
  );
}
