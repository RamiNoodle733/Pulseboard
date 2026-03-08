import { useState } from 'react';
import { useStore } from './store';

const PRESETS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
];

interface ColorPickerProps {
  onColorSelected: (color: string) => void;
}

export default function ColorPicker({ onColorSelected }: ColorPickerProps) {
  const [color, setColor] = useState('#FF6B6B');
  const userCount = useStore((s) => s.userCount);
  const currentStreak = useStore((s) => s.currentStreak);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-surface z-50">
      <div className="max-w-sm w-full mx-6">
        <div className="mb-10">
          <h1 className="text-2xl font-semibold text-white mb-2">Pulseboard</h1>
          <p className="text-sm text-zinc-500">
            Tap anywhere. Sync with strangers around the world.
          </p>
        </div>

        {(userCount > 0 || currentStreak > 0) && (
          <div className="flex gap-4 mb-8 text-xs text-zinc-500">
            {userCount > 0 && <span>{userCount} online now</span>}
            {currentStreak > 0 && <span>streak: {currentStreak}</span>}
          </div>
        )}

        <div className="space-y-6">
          <div>
            <p className="text-xs text-zinc-500 mb-3">Pick your color</p>
            <div className="flex gap-2.5 mb-4 flex-wrap">
              {PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-9 h-9 rounded-full transition-all ${
                    color === c
                      ? 'ring-2 ring-white/30 ring-offset-2 ring-offset-surface scale-110'
                      : 'hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 rounded-full cursor-pointer bg-transparent border-0 p-0"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="flex-1 px-3 py-2 bg-white/5 border border-zinc-800 rounded-lg text-zinc-300 text-sm focus:border-zinc-600 focus:outline-none"
                placeholder="#FF6B6B"
                spellCheck={false}
              />
            </div>
          </div>

          <div className="flex justify-center py-2">
            <div
              className="w-14 h-14 rounded-full glow-pulse"
              style={{ backgroundColor: color, boxShadow: `0 0 24px ${color}40` }}
            />
          </div>

          <button
            onClick={() => onColorSelected(color)}
            className="w-full py-3 bg-white text-black rounded-lg text-sm font-medium hover:bg-zinc-200 transition-all active:scale-[0.98]"
          >
            Join
          </button>

          <p className="text-[11px] text-zinc-600 text-center">
            You'll be user{(useStore.getState().userCount || 0) + 1}. Tap to pulse. Sync with others.
          </p>
        </div>
      </div>
    </div>
  );
}
