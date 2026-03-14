import { useEffect } from 'react';
import { useStore } from '../store';
import { getSocket } from '../socket';

const BOARD_LABELS: Record<string, string> = {
  global_xp: 'Global XP',
  global_level: 'Level',
  weekly_xp: 'Weekly',
};

export default function LeaderboardPanel() {
  const show = useStore((s) => s.showLeaderboard);
  const setShowLeaderboard = useStore((s) => s.setShowLeaderboard);
  const leaderboardType = useStore((s) => s.leaderboardType);
  const entries = useStore((s) => s.leaderboardEntries);
  const setLeaderboard = useStore((s) => s.setLeaderboard);

  useEffect(() => {
    if (!show) return;
    const socket = getSocket();
    socket?.emit('ws:get-leaderboard', { type: leaderboardType, limit: 50 });
  }, [show, leaderboardType]);

  if (!show) return null;

  function switchBoard(type: string) {
    const socket = getSocket();
    socket?.emit('ws:get-leaderboard', { type, limit: 50 });
    setLeaderboard(type, []);
  }

  return (
    <div className="fixed inset-y-0 right-0 w-80 max-w-[85vw] z-50 pointer-events-auto">
      <div
        className="h-full bg-zinc-900/95 backdrop-blur border-l border-zinc-800 overflow-y-auto"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 border-b border-zinc-800">
          <span className="text-sm font-medium text-zinc-300">Leaderboard</span>
          <button
            onClick={() => setShowLeaderboard(false)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800">
          {Object.entries(BOARD_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => switchBoard(key)}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                leaderboardType === key
                  ? 'text-amber-400 border-b-2 border-amber-400'
                  : 'text-zinc-500 hover:text-zinc-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Entries */}
        <div className="divide-y divide-zinc-800/50">
          {entries.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 text-sm">
              No entries yet
            </div>
          ) : (
            entries.map((entry) => (
              <div key={entry.rank} className="flex items-center gap-3 px-4 py-2.5">
                <div className={`w-6 text-right font-mono text-xs ${
                  entry.rank <= 3 ? 'text-amber-400 font-bold' : 'text-zinc-500'
                }`}>
                  {entry.rank}
                </div>
                {entry.avatarUrl ? (
                  <img
                    src={entry.avatarUrl}
                    alt=""
                    className="w-6 h-6 rounded-full border border-zinc-700"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-500">
                    ?
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-zinc-300 truncate">
                    {entry.username || 'Anonymous'}
                  </div>
                </div>
                <div className="text-xs text-zinc-400 font-mono">
                  {entry.score.toLocaleString()}
                </div>
                {entry.level != null && (
                  <div className="text-[10px] text-amber-400/60 font-mono">
                    Lv.{entry.level}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
