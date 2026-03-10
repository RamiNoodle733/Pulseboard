import { useStore } from '../store';

export default function CityTicker() {
  const cityTicker = useStore((s) => s.cityTicker);

  if (cityTicker.length === 0) return null;

  return (
    <div className="fixed bottom-14 left-0 right-0 z-10 pointer-events-none overflow-hidden opacity-40">
      <div className="flex gap-4 animate-ticker whitespace-nowrap font-mono text-xs uppercase tracking-wider px-4">
        {cityTicker.map((tick, i) => (
          <span
            key={`${tick.city}-${tick.t}-${i}`}
            style={{ color: tick.color }}
          >
            {tick.city}
          </span>
        ))}
      </div>
      <style>{`
        @keyframes ticker-scroll {
          from { transform: translateX(100%); }
          to { transform: translateX(-100%); }
        }
        .animate-ticker {
          animation: ticker-scroll 15s linear infinite;
        }
      `}</style>
    </div>
  );
}
