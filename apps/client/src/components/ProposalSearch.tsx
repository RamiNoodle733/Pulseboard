import { useState, useEffect, useCallback, useRef } from 'react';
import { getSocket } from '../socket';
import type { ProposalPayload } from '../socket';

export default function ProposalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProposalPayload[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handler = ({ proposals }: { proposals: ProposalPayload[]; total: number }) => {
      setResults(proposals);
      setSearching(false);
      setShowResults(true);
    };

    socket.on('ws:search-results', handler);
    return () => { socket.off('ws:search-results', handler); };
  }, []);

  const doSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setShowResults(false);
      return;
    }
    setSearching(true);
    getSocket()?.emit('ws:search-proposals', { query: trimmed, limit: 10 });
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, doSearch]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 bg-white/[0.03] rounded-lg px-3 py-2 border border-white/[0.04]">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-600 flex-shrink-0">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search proposals..."
          className="flex-1 bg-transparent text-zinc-300 text-xs font-mono placeholder:text-zinc-700 outline-none"
        />
        {searching && (
          <div className="w-3 h-3 border border-zinc-600 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 glass-strong rounded-xl overflow-hidden shadow-panel z-10 max-h-48 overflow-y-auto">
          {results.map((p) => (
            <button
              key={p.id}
              className="w-full px-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors border-b border-white/[0.03] last:border-0"
              onClick={() => {
                setQuery('');
                setShowResults(false);
              }}
            >
              <div className="text-[11px] font-mono text-zinc-400 truncate">{p.prompt}</div>
              <div className="text-[9px] text-zinc-600 mt-0.5 font-mono">
                {p.status} &middot; #{p.submittedByOrdinal}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
