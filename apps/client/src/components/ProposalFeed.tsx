import { useCallback } from 'react';
import { getSocket } from '../socket';
import { useStore } from '../store';
import type { ProposalPayload } from '../socket';
import ProposalSearch from './ProposalSearch';

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  submitted:     { bg: 'bg-zinc-800/60', text: 'text-zinc-400', label: 'queued' },
  generating:    { bg: 'bg-amber-900/20', text: 'text-amber-400', label: 'generating...' },
  'pr-created':  { bg: 'bg-blue-900/20', text: 'text-blue-400', label: 'voting' },
  merged:        { bg: 'bg-emerald-900/20', text: 'text-emerald-400', label: 'merged' },
  rejected:      { bg: 'bg-red-900/20', text: 'text-red-400', label: 'rejected' },
  failed:        { bg: 'bg-red-900/20', text: 'text-red-400', label: 'failed' },
};

function ProposalCard({ proposal }: { proposal: ProposalPayload }) {
  const isAuthenticated = useStore((s) => s.isAuthenticated);

  const handleVote = useCallback((direction: 'up' | 'down') => {
    getSocket()?.emit('ws:vote', { proposalId: proposal.id, direction });
  }, [proposal.id]);

  const status = STATUS_CONFIG[proposal.status] || STATUS_CONFIG.submitted;

  return (
    <div id={`proposal-${proposal.id}`} className="bg-white/[0.02] rounded-xl p-3.5 border border-white/[0.05] space-y-2.5 hover:border-white/[0.08] transition-all duration-200">
      <p className="text-zinc-300 text-sm font-mono leading-relaxed">
        &ldquo;{proposal.prompt}&rdquo;
      </p>

      <div className="flex items-center gap-2 text-[10px] font-mono">
        <span className={`px-2 py-0.5 rounded-md ${status.bg} ${status.text} font-medium`}>
          {status.label}
        </span>
        <span className="text-zinc-600">
          #{proposal.submittedByOrdinal} &middot; {timeAgo(proposal.submittedAt)}
        </span>
      </div>

      {proposal.summary && (
        <p className="text-zinc-500 text-[11px] font-mono leading-relaxed">
          {proposal.summary}
        </p>
      )}

      {proposal.changedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {proposal.changedFiles.map((f) => (
            <span key={f} className="text-[9px] font-mono text-zinc-600 bg-white/[0.03] px-1.5 py-0.5 rounded">
              {f.split('/').pop()}
            </span>
          ))}
        </div>
      )}

      {proposal.error && (
        <p className="text-red-400/60 text-[11px] font-mono">{proposal.error}</p>
      )}

      <div className="flex items-center gap-3 pt-0.5">
        {proposal.status === 'pr-created' && (
          <>
            {isAuthenticated ? (
              <>
                <button
                  onClick={() => handleVote('up')}
                  className={`text-xs font-mono transition-all duration-200 px-2 py-0.5 rounded ${
                    proposal.myVote === 'up'
                      ? 'text-emerald-400 bg-emerald-500/10'
                      : 'text-zinc-600 hover:text-emerald-400 hover:bg-emerald-500/5'
                  }`}
                >
                  &#x25B2; {proposal.upvoteCount}
                </button>
                <button
                  onClick={() => handleVote('down')}
                  className={`text-xs font-mono transition-all duration-200 px-2 py-0.5 rounded ${
                    proposal.myVote === 'down'
                      ? 'text-red-400 bg-red-500/10'
                      : 'text-zinc-600 hover:text-red-400 hover:bg-red-500/5'
                  }`}
                >
                  &#x25BC; {proposal.downvoteCount}
                </button>
              </>
            ) : (
              <span className="text-[10px] font-mono text-zinc-600 italic">
                Sign in to vote
              </span>
            )}
          </>
        )}
        {proposal.prUrl && (
          <a
            href={proposal.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono text-zinc-600 hover:text-blue-400 transition-colors ml-auto font-medium"
          >
            View PR &#x2192;
          </a>
        )}
      </div>
    </div>
  );
}

export default function ProposalFeed() {
  const proposals = useStore((s) => s.proposals);
  const show = useStore((s) => s.showProposalFeed);

  if (!show) return null;

  return (
    <div className="fixed right-0 top-0 bottom-0 w-80 z-40 glass-strong animate-slide-in-right shadow-panel pointer-events-auto">
      <div className="h-full overflow-y-auto">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
              Proposals
            </h2>
            <button
              onClick={() => useStore.getState().setShowProposalFeed(false)}
              className="text-zinc-600 hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-white/[0.04]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <ProposalSearch />

          {proposals.length === 0 && (
            <div className="text-center py-12">
              <div className="text-2xl mb-3 opacity-30">&#x1F4A1;</div>
              <p className="text-zinc-600 text-xs font-mono">
                No proposals yet. Type a prompt below to propose a change.
              </p>
            </div>
          )}

          {proposals.map((p) => (
            <ProposalCard key={p.id} proposal={p} />
          ))}
        </div>
      </div>
    </div>
  );
}
