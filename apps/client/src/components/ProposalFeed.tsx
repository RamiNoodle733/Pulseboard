import { useCallback } from 'react';
import { getSocket } from '../socket';
import { useStore } from '../store';
import type { ProposalPayload } from '../socket';

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

const STATUS_COLORS: Record<string, string> = {
  submitted: 'text-zinc-400 bg-zinc-800',
  generating: 'text-amber-400 bg-amber-900/30',
  'pr-created': 'text-blue-400 bg-blue-900/30',
  merged: 'text-emerald-400 bg-emerald-900/30',
  rejected: 'text-red-400 bg-red-900/30',
  failed: 'text-red-400 bg-red-900/30',
};

const STATUS_LABELS: Record<string, string> = {
  submitted: 'queued',
  generating: 'generating...',
  'pr-created': 'voting',
  merged: 'merged',
  rejected: 'rejected',
  failed: 'failed',
};

function ProposalCard({ proposal }: { proposal: ProposalPayload }) {
  const handleVote = useCallback((direction: 'up' | 'down') => {
    const socket = getSocket();
    if (socket) {
      socket.emit('ws:vote', { proposalId: proposal.id, direction });
    }
  }, [proposal.id]);

  const statusClass = STATUS_COLORS[proposal.status] || STATUS_COLORS.submitted;
  const statusLabel = STATUS_LABELS[proposal.status] || proposal.status;

  return (
    <div className="border border-zinc-800 rounded-lg p-3 space-y-2">
      {/* Prompt */}
      <p className="text-zinc-300 text-[11px] font-mono leading-relaxed">
        &ldquo;{proposal.prompt}&rdquo;
      </p>

      {/* Status + submitter */}
      <div className="flex items-center gap-2 text-[9px] font-mono">
        <span className={`px-1.5 py-0.5 rounded ${statusClass}`}>
          {statusLabel}
        </span>
        <span className="text-zinc-600">
          #{proposal.submittedByOrdinal} &middot; {timeAgo(proposal.submittedAt)}
        </span>
      </div>

      {/* AI summary */}
      {proposal.summary && (
        <p className="text-zinc-500 text-[10px] font-mono leading-snug">
          {proposal.summary}
        </p>
      )}

      {/* Changed files */}
      {proposal.changedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {proposal.changedFiles.map((f) => (
            <span key={f} className="text-[8px] font-mono text-zinc-600 bg-zinc-800/60 px-1.5 py-0.5 rounded">
              {f.split('/').pop()}
            </span>
          ))}
        </div>
      )}

      {/* Error */}
      {proposal.error && (
        <p className="text-red-400/70 text-[9px] font-mono">{proposal.error}</p>
      )}

      {/* Vote buttons + PR link */}
      <div className="flex items-center gap-3 pt-1">
        {proposal.status === 'pr-created' && (
          <>
            <button
              onClick={() => handleVote('up')}
              className={`text-[10px] font-mono transition-colors ${
                proposal.myVote === 'up'
                  ? 'text-emerald-400'
                  : 'text-zinc-600 hover:text-emerald-400'
              }`}
            >
              ▲ {proposal.upvoteCount}
            </button>
            <button
              onClick={() => handleVote('down')}
              className={`text-[10px] font-mono transition-colors ${
                proposal.myVote === 'down'
                  ? 'text-red-400'
                  : 'text-zinc-600 hover:text-red-400'
              }`}
            >
              ▼ {proposal.downvoteCount}
            </button>
          </>
        )}
        {proposal.prUrl && (
          <a
            href={proposal.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[9px] font-mono text-zinc-600 hover:text-blue-400 transition-colors ml-auto"
          >
            PR →
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
    <div className="fixed right-0 top-0 bottom-0 w-72 z-40 bg-zinc-900/95 backdrop-blur border-l border-zinc-800 overflow-y-auto pointer-events-auto">
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            Proposals
          </h2>
          <button
            onClick={() => useStore.getState().setShowProposalFeed(false)}
            className="text-zinc-600 hover:text-zinc-400 text-xs transition-colors"
          >
            ✕
          </button>
        </div>

        {proposals.length === 0 && (
          <p className="text-zinc-700 text-[10px] font-mono text-center py-8">
            No proposals yet. Type a prompt below to propose a change.
          </p>
        )}

        {proposals.map((p) => (
          <ProposalCard key={p.id} proposal={p} />
        ))}
      </div>
    </div>
  );
}
