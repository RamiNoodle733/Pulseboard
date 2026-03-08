import { useRef, useEffect } from 'react';

interface ShareCardProps {
  streak: number;
  cities: string[];
  onClose: () => void;
}

function drawCard(
  canvas: HTMLCanvasElement,
  streak: number,
  cities: string[],
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = 1200;
  const h = 630;

  // Background
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, w, h);

  // Decorative pulse rings
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 5; i++) {
    ctx.beginPath();
    ctx.arc(w / 2, h / 2 - 30, 60 + i * 50, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Streak number
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 160px Inter, system-ui, sans-serif';
  ctx.fillText(String(streak), w / 2, h / 2 - 40);

  // "streak" label
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.font = '24px Inter, system-ui, sans-serif';
  ctx.fillText('streak', w / 2, h / 2 + 50);

  // City names
  if (cities.length > 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '20px Inter, system-ui, sans-serif';
    const cityText = cities.join(' \u00b7 ');
    ctx.fillText(cityText, w / 2, h / 2 + 90);
  }

  // Branding
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.font = '16px Inter, system-ui, sans-serif';
  ctx.letterSpacing = '4px';
  ctx.fillText('PULSEBOARD', w / 2, h - 50);
  ctx.letterSpacing = '0px';
}

export default function ShareCard({ streak, cities, onClose }: ShareCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      drawCard(canvasRef.current, streak, cities);
    }
  }, [streak, cities]);

  const handleShare = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    if (!blob) return;

    const cityText =
      cities.length > 0
        ? `${cities[0]} was part of a`
        : 'Part of a';
    const text = `${cityText} ${streak}-streak sync on Pulseboard! ${window.location.origin}`;

    const file = new File([blob], 'pulseboard.png', { type: 'image/png' });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ text, files: [file] });
        return;
      } catch { /* user cancelled or not supported */ }
    }

    // Fallback: download + copy text
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pulseboard-streak-${streak}.png`;
    a.click();
    URL.revokeObjectURL(url);

    try {
      await navigator.clipboard?.writeText(text);
    } catch { /* clipboard not available */ }
  };

  const handleCopyLink = async () => {
    const cityText =
      cities.length > 0
        ? `${cities[0]} was part of a`
        : 'Part of a';
    const text = `${cityText} ${streak}-streak sync on Pulseboard! ${window.location.origin}`;
    try {
      await navigator.clipboard?.writeText(text);
    } catch { /* clipboard not available */ }
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div
        className="flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <canvas
          ref={canvasRef}
          width={1200}
          height={630}
          className="w-80 rounded border border-zinc-800"
        />
        <div className="flex gap-2">
          <button
            onClick={handleShare}
            className="px-4 py-2 bg-white text-black text-xs rounded hover:bg-zinc-200 transition-colors"
          >
            share
          </button>
          <button
            onClick={handleCopyLink}
            className="px-4 py-2 bg-zinc-900 text-zinc-300 text-xs rounded border border-zinc-800 hover:bg-zinc-800 transition-colors"
          >
            copy link
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-zinc-600 text-xs hover:text-zinc-400 transition-colors"
          >
            dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
