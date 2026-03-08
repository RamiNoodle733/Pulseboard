import { useState } from 'react';

const PRESETS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
];

interface ColorPickerProps {
  onColorSelected: (color: string) => void;
}

export default function ColorPicker({ onColorSelected }: ColorPickerProps) {
  const [color, setColor] = useState('#FF6B6B');

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-surface z-50 scanlines">
      <div className="panel p-8 max-w-sm w-full mx-4">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-zinc-100 mb-1">
            {'> '}PULSEBOARD<span className="animate-blink">_</span>
          </h1>
          <p className="text-xs text-zinc-500">
            real-time anonymous pulse sync
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <p className="text-xs text-zinc-500 mb-3 uppercase tracking-wider">select signal color</p>
            <div className="flex gap-2 mb-4 flex-wrap">
              {PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 transition-all ${
                    color === c ? 'ring-1 ring-zinc-400 ring-offset-1 ring-offset-surface scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 text-sm">{'>'}</span>
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="flex-1 px-3 py-2 bg-transparent border border-zinc-800 text-zinc-200 text-sm font-mono focus:border-zinc-600 focus:outline-none"
                placeholder="#FF6B6B"
                spellCheck={false}
              />
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 cursor-pointer bg-transparent border-0 p-0"
              />
            </div>
          </div>

          <div className="flex justify-center">
            <div
              className="w-16 h-16 glow-pulse"
              style={{ backgroundColor: color, boxShadow: `0 0 20px ${color}40` }}
            />
          </div>

          <button
            onClick={() => onColorSelected(color)}
            className="w-full py-3 border border-zinc-700 text-zinc-200 text-sm uppercase tracking-wider hover:bg-zinc-900 hover:border-zinc-500 transition-all active:scale-[0.98]"
          >
            initialize
          </button>

          <div className="text-[10px] text-zinc-600 space-y-1">
            <p>you will be assigned a user id</p>
            <p>tap to send pulses / sync with others to build streaks</p>
          </div>
        </div>
      </div>
    </div>
  );
}
