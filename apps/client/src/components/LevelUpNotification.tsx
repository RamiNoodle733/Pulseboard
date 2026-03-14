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
        <div
          className="text-5xl font-bold tracking-tight"
          style={{
            color: '#f59e0b',
            textShadow: '0 0 40px rgba(245,158,11,0.5), 0 0 80px rgba(245,158,11,0.3)',
          }}
        >
          LEVEL UP!
        </div>
        <div
          className="text-7xl font-black mt-2"
          style={{
            color: '#fbbf24',
            textShadow: '0 0 60px rgba(251,191,36,0.6), 0 0 120px rgba(251,191,36,0.2)',
          }}
        >
          {notification.level}
        </div>
      </div>
      <style>{`
        @keyframes level-up-anim {
          0% { opacity: 0; transform: scale(0.5); }
          15% { opacity: 1; transform: scale(1.1); }
          25% { transform: scale(1); }
          75% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.2) translateY(-20px); }
        }
        .animate-level-up {
          animation: level-up-anim 3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
