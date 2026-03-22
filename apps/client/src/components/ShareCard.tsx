import { useRef, useEffect } from 'react';

interface ShareCardProps {
  streak: number;
  cities: string[];
  onClose: () => void;
}

function drawCard(canvas: HTMLCanvasElement, streak: number, cities: string[]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = 1200;
  const h = 630;

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#0a0a0a');
  bg.addColorStop(1, '#0d0d12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Decorative rings
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 6; i++) {
    ctx.beginPath();
    ctx.arc(w / 2, h / 2 - 20, 50 + i * 45, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Amber glow behind number
  const glow = ctx.createRadialGradient(w / 2, h / 2 - 40, 0, w / 2, h / 2 - 40, 200);
  glow.addColorStop(0, 'rgba(245, 158, 11, 0.08)');
  glow.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // Streak number
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 160px Inter, system-ui, sans-serif';
  ctx.fillText(String(streak), w / 2, h / 2 - 30);

  // "resonance" label
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.font = '300 22px Inter, system-ui, sans-serif';
  ctx.letterSpacing = '8px';
  ctx.fillText('RESONANCE', w / 2, h / 2 + 55);
  ctx.letterSpacing = '0px';

  // City names
  if (cities.length > 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '18px Inter, system-ui, sans-serif';
    const cityText = cities.join('  \u00b7  ');
    ctx.fillText(cityText, w / 2, h / 2 + 95);
  }

  // Branding
  ctx.fillStyle = 'rgba(245, 158, 11, 0.3)';
  ctx.font = '600 14px Inter, system-ui, sans-serif';
  ctx.letterSpacing = '6px';
  ctx.fillText('PULSEBOARD', w / 2, h - 45);
  ctx.letterSpacing = '0px';
}

export default function ShareCard({ streak, cities, onClose }: ShareCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) drawCard(canvasRef.current, streak, cities);
  }, [streak, cities]);

  const handleShare = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    if (!blob) return;

    const cityText = cities.length > 0 ? `${cities[0]} was part of a` : 'Part of a';
    const text = `${cityText} ${streak}-streak resonance on Pulseboard! ${window.location.origin}`;
    const file = new File([blob], 'pulseboard.png', { type: 'image/png' });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ text, files: [file] });
        return;
      } catch { /* user cancelled */ }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pulseboard-streak-${streak}.png`;
    a.click();
    URL.revokeObjectURL(url);

    try { await navigator.clipboard?.writeText(text); } catch { /* clipboard not available */ }
  };

  const handleCopyLink = async () => {
    const cityText = cities.length > 0 ? `${cities[0]} was part of a` : 'Part of a';
    const text = `${cityText} ${streak}-streak resonance on Pulseboard! ${window.location.origin}`;
    try { await navigator.clipboard?.writeText(text); } catch { /* clipboard not available */ }
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex flex-col items-center gap-5 animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
      >
        <canvas
          ref={canvasRef}
          width={1200}
          height={630}
          className="w-80 rounded-xl border border-white/[0.06] shadow-panel"
        />
        <div className="flex gap-2">
          <button
            onClick={handleShare}
            className="px-5 py-2 bg-white text-black text-xs font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
          >
            Share
          </button>
          <button
            onClick={handleCopyLink}
            className="px-5 py-2 glass text-zinc-300 text-xs font-medium rounded-lg hover:bg-white/[0.06] transition-colors"
          >
            Copy Link
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-zinc-600 text-xs hover:text-zinc-400 transition-colors font-medium"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
