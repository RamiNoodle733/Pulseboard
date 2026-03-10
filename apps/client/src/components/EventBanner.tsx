import { useStore } from '../store';
import { useEffect, useState } from 'react';
import { playEventSound } from '../audio';

const EVENT_COLORS: Record<string, string> = {
  surge: 'border-amber-500/40 text-amber-300',
  convergence: 'border-cyan-500/40 text-cyan-300',
  resonance_wave: 'border-white/30 text-white',
  city_awakening: 'border-green-500/40 text-green-300',
  quiet_zone: 'border-zinc-700/40 text-zinc-500',
  record_broken: 'border-yellow-500/40 text-yellow-300',
};

export default function EventBanner() {
  const currentEvent = useStore((s) => s.currentEvent);
  const narration = useStore((s) => s.narration);
  const soundEnabled = useStore((s) => s.soundEnabled);
  const [visible, setVisible] = useState(false);
  const [lastEventId, setLastEventId] = useState('');

  useEffect(() => {
    if (currentEvent && currentEvent.id !== lastEventId) {
      setLastEventId(currentEvent.id);
      setVisible(true);
      playEventSound(soundEnabled, currentEvent.type);

      const timeout = setTimeout(() => setVisible(false), currentEvent.duration);
      return () => clearTimeout(timeout);
    } else if (!currentEvent) {
      setVisible(false);
    }
  }, [currentEvent, lastEventId, soundEnabled]);

  const showNarration = !visible && narration;

  if (!visible && !showNarration) return null;

  if (showNarration) {
    return (
      <div className="fixed top-14 left-1/2 -translate-x-1/2 z-15 pointer-events-none">
        <div className="px-4 py-1.5 text-sm text-zinc-500 italic text-center max-w-md opacity-70 transition-opacity duration-1000">
          {narration}
        </div>
      </div>
    );
  }

  const colorClass = EVENT_COLORS[currentEvent?.type || ''] || 'border-zinc-700/40 text-zinc-400';

  return (
    <div className="fixed top-12 left-1/2 -translate-x-1/2 z-15 pointer-events-none animate-fade-in">
      <div className={`px-4 py-1.5 bg-black/70 backdrop-blur-sm border rounded-full text-sm tracking-wider uppercase ${colorClass}`}>
        {currentEvent?.title}
      </div>
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}
