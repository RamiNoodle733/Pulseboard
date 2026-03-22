import { useState } from 'react';
import { getSocket } from '../socket';
import { useStore } from '../store';

const PRESETS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#FF8A5C', '#EA5C5C', '#6C5CE7', '#00B894',
  '#FDA7DF', '#55E6C1', '#E77F67', '#786FA6',
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
    <div className="absolute top-14 left-4 z-50 glass-strong rounded-xl p-4 shadow-panel animate-fade-in-scale w-[220px]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Color</span>
        <button
          onClick={onClose}
          className="text-zinc-600 hover:text-zinc-300 transition-colors p-0.5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="grid grid-cols-8 gap-1.5 mb-3">
        {PRESETS.map((c) => (
          <button
            key={c}
            onClick={() => apply(c)}
            className={`w-5 h-5 rounded-full transition-all duration-150 ${
              value === c
                ? 'ring-2 ring-white/30 scale-125'
                : 'hover:scale-110 opacity-70 hover:opacity-100'
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
        <input
          type="color"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-0 p-0"
        />
        <button
          onClick={() => apply(value)}
          className="flex-1 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg text-zinc-300 text-xs font-medium transition-all duration-200"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
