import { useState, useCallback } from 'react';
import { getSocket, SERVER_URL } from '../socket';
import { useStore } from '../store';

export default function PromptBar() {
  const aiEnabled = useStore((s) => s.aiEnabled);
  const freePromptsRemaining = useStore((s) => s.freePromptsRemaining);
  const paidEnabled = useStore((s) => s.paidEnabled);
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmitFree = freePromptsRemaining > 0;

  const handleSubmit = useCallback(async () => {
    const text = prompt.trim();
    if (!text || text.length < 5 || text.length > 500 || submitting) return;

    const socket = getSocket();
    if (!socket) return;

    setSubmitting(true);

    try {
      if (canSubmitFree) {
        socket.emit('ws:submit-prompt', { prompt: text });
      } else if (paidEnabled) {
        const res = await fetch(`${SERVER_URL}/stripe/create-intent`, { method: 'POST' });
        if (!res.ok) throw new Error('Payment failed');
        const { paymentIntentId } = await res.json() as { paymentIntentId: string; clientSecret: string };
        socket.emit('ws:submit-prompt', { prompt: text, paymentIntentId });
      }
      setPrompt('');
    } catch {
      useStore.getState().setError('Prompt submission failed');
    } finally {
      setSubmitting(false);
    }
  }, [prompt, submitting, canSubmitFree, paidEnabled]);

  if (!aiEnabled) return null;

  const canSubmit = prompt.trim().length >= 5 && !submitting && (canSubmitFree || paidEnabled);

  return (
    <div className="fixed bottom-16 left-0 right-0 z-20 flex justify-center pointer-events-none px-4">
      <div className="w-full max-w-lg pointer-events-auto">
        <div className="flex items-center gap-2 glass rounded-xl px-4 py-2.5 shadow-panel">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            placeholder="Describe a change to the site..."
            maxLength={500}
            className="flex-1 bg-transparent text-zinc-200 text-sm font-mono placeholder:text-zinc-600 outline-none"
            disabled={submitting}
          />
          <span className="text-[10px] font-mono text-zinc-600 whitespace-nowrap">
            {canSubmitFree ? `${freePromptsRemaining} free` : paidEnabled ? '$0.25' : 'limit reached'}
          </span>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="text-[11px] font-mono uppercase tracking-wider px-3.5 py-1.5 rounded-lg
              bg-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.1]
              disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-200 font-medium"
          >
            {submitting ? '...' : 'send'}
          </button>
        </div>
      </div>
    </div>
  );
}
