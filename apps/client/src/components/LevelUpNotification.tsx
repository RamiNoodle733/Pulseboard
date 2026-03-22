import { useEffect, useRef } from 'react';
import { useStore } from '../store';

export default function LevelUpNotification() {
  const notification = useStore((s) => s.levelUpNotification);
  const clearNotification = useStore((s) => s.clearLevelUpNotification);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!notification) return;
    timerRef.current = setTimeout(() => {
      clearNotification();
    }, 3000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [notification, clearNotification]);

  if (!notification) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none">
      <div className="text-center animate-level-up">
        <div className="text-base font-semibold tracking-[0.3em] uppercase text-amber-500/70 mb-2">
          Level Up
        </div>
        <div
          className="text-8xl font-black tracking-tight text-glow-amber"
          style={{ color: '#fbbf24' }}
        >
          {notification.level}
        </div>
      </div>
    </div>
  );
}
