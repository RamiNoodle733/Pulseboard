import { useState } from 'react';
import { getSocket } from '../socket';
import { useStore } from '../store';

const PRESETS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
];

interface ColorEditorProps {
  currentColor: string;
  onClose: () => void;
}

export default function ColorEditor({ currentColor, onClose }: ColorEditorProps) {
  const [value, setValue] = useState(currentColor);

  const apply = (color: string) => {
    const socket = getSocket();
    if (socket && /^#[0-9A-Fa-f]{6}$/.test(color)) {
      socket.emit('ws:change-color', { color });
      useStore.getState().setMyColor(color);
      onClose();
    }
  };

  return (
    <div className="absolute top-12 left-4 z-50 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <div className="flex gap-2 mb-2 flex-wrap">
        {PRESETS.map((c) => (
          <button
            key={c}
            onClick={() => apply(c)}
            className={`w-6 h-6 rounded-full transition-all ${
              value === c
                ? 'ring-1 ring-white/30 scale-110'
                : 'hover:scale-105 opacity-80 hover:opacity-100'
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
        />
        <button
          onClick={() => apply(value)}
          className="px-2 py-1 bg-white/10 rounded text-zinc-300 text-xs hover:bg-white/20 transition-colors"
        >
          apply
        </button>
        <button
          onClick={onClose}
          className="text-zinc-600 text-xs hover:text-zinc-400 transition-colors ml-auto"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
