import { useState, useEffect, useCallback, useRef } from 'react';
import { getSocket } from '../socket';
import type { ProposalPayload } from '../socket';

const FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Voting', value: 'pr-created' },
  { label: 'Merged', value: 'merged' },
  { label: 'Rejected', value: 'rejected' },
];

export default function ProposalSearch() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [results, setResults] = useState<ProposalPayload[]>([]);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const doSearch = useCallback((q: string, s: string) => {
    const socket = getSocket();
    if (!socket) return;
    setSearching(true);
    socket.emit('ws:search-proposals', { query: q, status: s !== 'all' ? s : undefined, limit: 20 });
  }, []);

  // Listen for search results
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handler = (data: { proposals: ProposalPayload[]; total: number }) => {
      setResults(data.proposals);
      setTotal(data.total);
      setSearching(false);
    };
    socket.on('ws:search-results', handler);
    return () => { socket.off('ws:search-results', handler); };
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (query.trim() || status !== 'all') {
        doSearch(query, status);
      } else {
        setResults([]);
        setTotal(0);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, status, doSearch]);

  const showResults = query.trim() || status !== 'all';

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search proposals..."
        className="w-full bg-zinc-800/60 text-zinc-300 text-sm font-mono placeholder:text-zinc-600 outline-none px-2.5 py-1.5 rounded border border-zinc-700/50"
      />

      <div className="flex gap-1 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={`text-xs font-mono px-2 py-0.5 rounded transition-colors ${
              status === f.value
                ? 'bg-zinc-700 text-zinc-200'
                : 'bg-zinc-800/40 text-zinc-600 hover:text-zinc-400'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {showResults && (
        <div className="text-xs font-mono text-zinc-600">
          {searching ? 'Searching...' : `${total} result${total !== 1 ? 's' : ''}`}
        </div>
      )}

      {showResults && results.length === 0 && !searching && (
        <p className="text-zinc-700 text-xs font-mono text-center py-4">
          No proposals found
        </p>
      )}
    </div>
  );
}
