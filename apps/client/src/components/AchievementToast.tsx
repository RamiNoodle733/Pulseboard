import { useEffect, useState } from 'react';
import { useStore } from '../store';

export default function AchievementToast() {
  const toast = useStore((s) => s.achievementToast);
  const clearToast = useStore((s) => s.clearAchievementToast);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (toast) {
      requestAnimationFrame(() => setVisible(true));
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(clearToast, 300);
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [toast, clearToast]);

  if (!toast) return null;

  return (
    <div
      className={`fixed top-20 left-1/2 z-50 transition-all duration-300 ease-out
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}
      style={{ transform: `translateX(-50%) translateY(${visible ? 0 : -16}px)` }}
    >
      <div className="glass-strong rounded-2xl px-5 py-3.5 flex items-center gap-3.5 shadow-panel border-amber-500/20 glow-amber">
        <div className="text-2xl">{toast.icon || '!'}</div>
        <div>
          <div className="text-amber-400 text-[10px] font-bold uppercase tracking-[0.15em]">
            Achievement Unlocked
          </div>
          <div className="text-white text-sm font-semibold mt-0.5 tracking-tight">{toast.name}</div>
          <div className="text-zinc-400 text-[11px] mt-0.5 leading-snug">{toast.description}</div>
        </div>
      </div>
    </div>
  );
}
