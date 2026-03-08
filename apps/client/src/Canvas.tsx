import { useEffect, useRef } from 'react';
import { useStore } from './store';

interface CanvasProps {
  width: number;
  height: number;
}

export default function Canvas({ width, height }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pulses = useStore((s) => s.pulses);
  const showingBurst = useStore((s) => s.showingBurst);
  const clearOldPulses = useStore((s) => s.clearOldPulses);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf: number;

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // subtle grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.lineWidth = 0.5;
      const step = 50;
      for (let x = step; x < width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = step; y < height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      const now = Date.now();
      const lifetime = 3000;

      for (const pulse of pulses) {
        const age = now - pulse.t;
        if (age > lifetime) continue;

        const progress = age / lifetime;
        const radius = 10 + progress * 50;
        const opacity = 1 - progress;
        const alphaHex = Math.floor(opacity * 255).toString(16).padStart(2, '0');

        // outer ring
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `${pulse.color}${alphaHex}`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // inner dot
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = `${pulse.color}${alphaHex}`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = pulse.color;
        ctx.fill();
        ctx.shadowBlur = 0;

        // user label
        if (opacity > 0.3) {
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.fillStyle = `rgba(161, 161, 170, ${opacity})`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`user${pulse.ordinal}`, pulse.x, pulse.y - radius - 12);
        }
      }

      // burst effect
      if (showingBurst) {
        const gradient = ctx.createRadialGradient(
          width / 2, height / 2, 0,
          width / 2, height / 2, Math.max(width, height) / 2,
        );
        gradient.addColorStop(0, 'rgba(0, 255, 65, 0.15)');
        gradient.addColorStop(1, 'rgba(0, 255, 65, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }

      raf = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(raf);
  }, [pulses, showingBurst, width, height]);

  useEffect(() => {
    const iv = setInterval(clearOldPulses, 1000);
    return () => clearInterval(iv);
  }, [clearOldPulses]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0"
    />
  );
}
