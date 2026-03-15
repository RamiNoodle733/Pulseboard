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
      className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 transition-all duration-300
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}
    >
      <div className="bg-zinc-900/95 border border-amber-500/40 rounded-xl px-5 py-3 flex items-center gap-3 shadow-lg shadow-amber-500/10">
        <div className="text-2xl">{toast.icon || '!'}</div>
        <div>
          <div className="text-amber-400 text-sm font-semibold tracking-wide">
            Achievement Unlocked
          </div>
          <div className="text-white text-sm font-medium">{toast.name}</div>
          <div className="text-zinc-400 text-xs mt-0.5">{toast.description}</div>
        </div>
      </div>
    </div>
  );
}
