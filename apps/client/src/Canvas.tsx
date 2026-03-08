import { useEffect, useRef, useCallback } from 'react';
import { useStore } from './store';

interface CanvasProps {
  width: number;
  height: number;
  onPulse: (nx: number, ny: number) => void;
}

export default function Canvas({ width, height, onPulse }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pulses = useStore((s) => s.pulses);
  const showingBurst = useStore((s) => s.showingBurst);
  const lastSync = useStore((s) => s.lastSync);
  const clearOldPulses = useStore((s) => s.clearOldPulses);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      onPulse(e.clientX / width, e.clientY / height);
    },
    [width, height, onPulse],
  );

  const handleTouch = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (e.touches.length === 0) return;
      e.preventDefault();
      onPulse(e.touches[0].clientX / width, e.touches[0].clientY / height);
    },
    [width, height, onPulse],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf: number;

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      const now = Date.now();
      const lifetime = 3000;

      for (const pulse of pulses) {
        const age = now - pulse.t;
        if (age > lifetime) continue;

        const progress = age / lifetime;
        const radius = 8 + progress * 45;
        const opacity = 1 - progress;
        const alphaHex = Math.floor(opacity * 255).toString(16).padStart(2, '0');

        // outer ring
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `${pulse.color}${alphaHex}`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // inner dot with glow
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = `${pulse.color}${alphaHex}`;
        ctx.shadowBlur = 10;
        ctx.shadowColor = pulse.color;
        ctx.fill();
        ctx.shadowBlur = 0;

        // label
        if (opacity > 0.3) {
          ctx.font = '10px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = `rgba(161, 161, 170, ${opacity * 0.8})`;
          const label = pulse.region
            ? `user${pulse.ordinal} · ${pulse.region}`
            : `user${pulse.ordinal}`;
          ctx.fillText(label, pulse.x, pulse.y - radius - 10);
        }
      }

      // constellation effect on sync
      if (showingBurst && lastSync) {
        const syncAge = now - lastSync.t;
        const syncLifetime = 1500;

        if (syncAge < syncLifetime) {
          const syncOpacity = 1 - syncAge / syncLifetime;

          // find positions of synced users
          const positions: { x: number; y: number; color: string }[] = [];
          for (const uid of lastSync.userIds) {
            for (let i = pulses.length - 1; i >= 0; i--) {
              if (pulses[i].userId === uid) {
                positions.push({ x: pulses[i].x, y: pulses[i].y, color: pulses[i].color });
                break;
              }
            }
          }

          if (positions.length >= 2) {
            // lines connecting synced positions
            ctx.lineWidth = 1;
            ctx.globalAlpha = syncOpacity * 0.4;

            for (let i = 0; i < positions.length; i++) {
              for (let j = i + 1; j < positions.length; j++) {
                ctx.beginPath();
                ctx.moveTo(positions[i].x, positions[i].y);
                ctx.lineTo(positions[j].x, positions[j].y);
                ctx.strokeStyle = '#fff';
                ctx.stroke();
              }
            }

            // ripple from centroid
            const cx = positions.reduce((s, p) => s + p.x, 0) / positions.length;
            const cy = positions.reduce((s, p) => s + p.y, 0) / positions.length;
            const rippleRadius = (syncAge / syncLifetime) * Math.max(width, height) * 0.3;

            ctx.beginPath();
            ctx.arc(cx, cy, rippleRadius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 255, 255, ${syncOpacity * 0.12})`;
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.globalAlpha = 1;
          }
        }
      }

      raf = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(raf);
  }, [pulses, showingBurst, lastSync, width, height]);

  useEffect(() => {
    const iv = setInterval(clearOldPulses, 1000);
    return () => clearInterval(iv);
  }, [clearOldPulses]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 cursor-crosshair"
      onClick={handleClick}
      onTouchStart={handleTouch}
    />
  );
}
