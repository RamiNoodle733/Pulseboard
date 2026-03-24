import { useEffect } from 'react';
import { useStore } from '../store';
import { getSocket } from '../socket';

const BOARD_LABELS: Record<string, string> = {
  global_xp: 'Global XP',
  global_level: 'Level',
  weekly_xp: 'Weekly',
};

const MEDAL_COLORS = ['text-amber-400', 'text-zinc-400', 'text-amber-600'];

export default function LeaderboardPanel() {
  const show = useStore((s) => s.showLeaderboard);
  const setShowLeaderboard = useStore((s) => s.setShowLeaderboard);
  const leaderboardType = useStore((s) => s.leaderboardType);
  const entries = useStore((s) => s.leaderboardEntries);
  const setLeaderboard = useStore((s) => s.setLeaderboard);

  useEffect(() => {
    if (!show) return;
    getSocket()?.emit('ws:get-leaderboard', { type: leaderboardType, limit: 50 });
  }, [show, leaderboardType]);

  if (!show) return null;

  function switchBoard(type: string) {
    setLeaderboard(type, entries);
    getSocket()?.emit('ws:get-leaderboard', { type, limit: 50 });
  }

  return (
    <div className="fixed inset-0 z-50 pointer-events-auto" onClick={() => setShowLeaderboard(false)}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="absolute inset-y-0 right-0 w-80 max-w-[85vw] glass-strong animate-slide-in-right shadow-panel"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        <div className="h-full overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pb-3 border-b border-white/[0.06]">
            <span className="text-sm font-semibold text-zinc-200 tracking-tight">Leaderboard</span>
            <button
              onClick={() => setShowLeaderboard(false)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-white/[0.04]"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/[0.06]">
            {Object.entries(BOARD_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => switchBoard(key)}
                className={`flex-1 py-2.5 text-xs font-medium transition-all duration-200 ${
                  leaderboardType === key
                    ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-500/5'
                    : 'text-zinc-500 hover:text-zinc-400 hover:bg-white/[0.02]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Entries */}
          <div className="py-1">
            {entries.length === 0 ? (
              <div className="text-center py-12 text-zinc-600 text-sm">
                No entries yet
              </div>
            ) : (
              entries.map((entry) => (
                <div
                  key={entry.rank}
                  className={`flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-white/[0.02] ${
                    entry.rank <= 3 ? 'bg-white/[0.01]' : ''
                  }`}
                >
                  <div className={`w-5 text-right font-mono text-xs font-bold ${
                    entry.rank <= 3 ? MEDAL_COLORS[entry.rank - 1] : 'text-zinc-600'
                  }`}>
                    {entry.rank <= 3 ? ['1st', '2nd', '3rd'][entry.rank - 1] : entry.rank}
                  </div>
                  {entry.avatarUrl ? (
                    <img
                      src={entry.avatarUrl}
                      alt=""
                      className="w-7 h-7 rounded-full ring-1 ring-white/10"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-zinc-800/80 flex items-center justify-center text-[10px] text-zinc-500 ring-1 ring-white/5">
                      ?
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-zinc-300 truncate font-medium">
                      {entry.username || 'Anonymous'}
                    </div>
                  </div>
                  <div className="text-xs text-zinc-400 font-mono font-medium">
                    {entry.score.toLocaleString()}
                  </div>
                  {entry.level != null && (
                    <div className="text-[10px] text-amber-400/50 font-mono font-medium bg-amber-500/5 px-1.5 py-0.5 rounded">
                      {entry.level}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
