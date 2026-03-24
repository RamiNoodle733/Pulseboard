import { useStore } from '../store';
import { useEffect, useState } from 'react';
import { playEventSound } from '../audio';

const EVENT_STYLES: Record<string, { border: string; text: string; glow: string }> = {
  surge:           { border: 'border-amber-500/30', text: 'text-amber-300', glow: 'shadow-[0_0_20px_rgba(245,158,11,0.15)]' },
  convergence:     { border: 'border-cyan-500/30',  text: 'text-cyan-300',  glow: 'shadow-[0_0_20px_rgba(6,182,212,0.15)]' },
  resonance_wave:  { border: 'border-white/20',     text: 'text-white',     glow: 'shadow-[0_0_20px_rgba(255,255,255,0.1)]' },
  city_awakening:  { border: 'border-green-500/30', text: 'text-green-300', glow: 'shadow-[0_0_20px_rgba(34,197,94,0.15)]' },
  quiet_zone:      { border: 'border-zinc-700/30',  text: 'text-zinc-500',  glow: '' },
  record_broken:   { border: 'border-yellow-500/30', text: 'text-yellow-300', glow: 'shadow-[0_0_20px_rgba(234,179,8,0.15)]' },
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
      <div className="fixed top-14 left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-fade-in">
        <div className="px-6 py-2 text-xs text-zinc-500 italic text-center max-w-md leading-relaxed">
          {narration}
        </div>
      </div>
    );
  }

  const style = EVENT_STYLES[currentEvent?.type || ''] || { border: 'border-zinc-700/30', text: 'text-zinc-400', glow: '' };

  return (
    <div className="fixed top-12 left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-fade-in">
      <div className={`px-5 py-2 glass rounded-full text-xs tracking-[0.15em] uppercase font-medium ${style.border} ${style.text} ${style.glow}`}>
        {currentEvent?.title}
      </div>
    </div>
  );
}
