import { useState } from 'react';

interface ColorPickerProps {
  onColorSelected: (color: string) => void;
}

export default function ColorPicker({ onColorSelected }: ColorPickerProps) {
  const [customColor, setCustomColor] = useState('#FF6B6B');

  const handleJoin = () => {
    onColorSelected(customColor);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black z-50">
      <div className="glass rounded-2xl p-8 max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">Pulseboard</h1>
          <p className="text-white/60 text-sm">
            Sync with the world. Choose your color.
          </p>
        </div>

        <div className="space-y-6">
          {/* Custom Color */}
          <div>
            <h3 className="text-sm font-medium mb-3 text-white/80">Choose Your Color</h3>
            <div className="flex gap-3">
              <input
                type="color"
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value)}
                className="w-16 h-16 rounded-lg cursor-pointer"
              />
              <div className="flex-1 flex items-center">
                <input
                  type="text"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white font-mono"
                  placeholder="#FF6B6B"
                />
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="text-center">
            <div
              className="w-24 h-24 rounded-full mx-auto mb-3 glow animate-pulse-dot"
              style={{ backgroundColor: customColor }}
            />
            <p className="text-sm text-white/60">Your pulse color</p>
          </div>

          {/* Join Button */}
          <button
            onClick={handleJoin}
            className="w-full py-4 bg-white text-black rounded-lg font-semibold hover:bg-white/90 transition-all active:scale-95"
          >
            Join Pulseboard
          </button>

          {/* Info */}
          <div className="text-xs text-white/40 text-center space-y-1">
            <p>You'll be assigned a UserN identity</p>
            <p>Tap to send pulses • Sync with others to build streaks</p>
          </div>
        </div>
      </div>
    </div>
  );
}
