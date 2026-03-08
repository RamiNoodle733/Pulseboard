import { useStore } from '../store';

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

  const activeProposals = proposals.filter((p) => p.status === 'pr-created' || p.status === 'generating').length;

  return (
    <div
      className="absolute top-0 left-0 right-0 px-4 py-3 flex items-center justify-between pointer-events-none text-xs z-10"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0.75rem))' }}
    >
      {/* Left: color dot */}
      <button
        onClick={onColorEdit}
        className="pointer-events-auto w-4 h-4 rounded-full border border-zinc-800 hover:scale-110 transition-transform"
        style={{ backgroundColor: myColor }}
      />

      {/* Right: proposals, mute, count, status */}
      <div className="flex items-center gap-3 pointer-events-auto">
        {aiEnabled && (
          <button
            onClick={onToggleProposals}
            className="relative text-zinc-600 hover:text-zinc-400 transition-colors"
            title="Proposals"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18h6" />
              <path d="M10 22h4" />
              <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
            </svg>
            {activeProposals > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500" />
            )}
          </button>
        )}
        <button
          onClick={toggleSound}
          className="text-zinc-600 hover:text-zinc-400 transition-colors"
          title={soundEnabled ? 'Mute' : 'Unmute'}
        >
          {soundEnabled ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          )}
        </button>
        <span className="text-zinc-700 tabular-nums">{userCount}</span>
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            connected ? 'bg-emerald-600' : 'bg-red-600'
          }`}
        />
      </div>
    </div>
  );
}
