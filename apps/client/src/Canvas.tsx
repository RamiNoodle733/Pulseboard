import { useEffect, useRef } from 'react';
import { useStore } from './store';

interface CanvasProps {
  width: number;
  height: number;
}

export default function Canvas({ width, height }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pulses = useStore((state) => state.pulses);
  const showingBurst = useStore((state) => state.showingBurst);
  const clearOldPulses = useStore((state) => state.clearOldPulses);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const animate = () => {
      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      const now = Date.now();

      // Draw pulses
      pulses.forEach((pulse) => {
        const age = now - pulse.t;
        const lifetime = 3000; // 3 seconds

        if (age > lifetime) return;

        const progress = age / lifetime;
        const radius = 10 + progress * 50;
        const opacity = 1 - progress;

        // Outer ring
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `${pulse.color}${Math.floor(opacity * 100).toString(16).padStart(2, '0')}`;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Inner dot
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = `${pulse.color}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}`;
        ctx.fill();

        // Glow effect
        ctx.shadowBlur = 20;
        ctx.shadowColor = pulse.color;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Draw username label
        if (opacity > 0.3) {
          ctx.font = '12px system-ui, sans-serif';
          ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`User${pulse.ordinal}`, pulse.x, pulse.y - radius - 15);
        }
      });

      // Draw burst effect
      if (showingBurst) {
        const gradient = ctx.createRadialGradient(
          width / 2,
          height / 2,
          0,
          width / 2,
          height / 2,
          Math.max(width, height) / 2
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [pulses, showingBurst, width, height]);

  // Cleanup old pulses periodically
  useEffect(() => {
    const interval = setInterval(() => {
      clearOldPulses();
    }, 1000);

    return () => clearInterval(interval);
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
