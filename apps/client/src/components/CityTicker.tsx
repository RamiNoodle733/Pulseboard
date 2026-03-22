import { useStore } from '../store';

export default function CityTicker() {
  const cityTicker = useStore((s) => s.cityTicker);

  if (cityTicker.length === 0) return null;

  return (
    <div className="fixed bottom-14 left-0 right-0 z-10 pointer-events-none overflow-hidden opacity-30">
      <div className="flex gap-6 animate-ticker whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.2em] px-4">
        {cityTicker.map((tick, i) => (
          <span
            key={`${tick.city}-${tick.t}-${i}`}
            className="opacity-60"
            style={{ color: tick.color }}
          >
            {tick.city}
          </span>
        ))}
      </div>
    </div>
  );
}
