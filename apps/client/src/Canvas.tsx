import { useEffect, useRef, useCallback } from 'react';
import { useStore } from './store';
import type { Pulse, SyncEvent } from './store';
import { ParticleSystem } from './particles';

interface CanvasProps {
  width: number;
  height: number;
  onPulse: (nx: number, ny: number) => void;
  previewMode?: boolean;
}

function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.floor(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return hex + a;
}

export default function Canvas({ width, height, onPulse, previewMode }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particleSystem = useRef(new ParticleSystem());

  // Refs for animation data — avoids re-creating the loop on every state change
  const pulsesRef = useRef<Pulse[]>([]);
  const burstRef = useRef<{ showing: boolean; sync: SyncEvent | null }>({
    showing: false,
    sync: null,
  });
  const activityRef = useRef(0);
  const shakeRef = useRef({ intensity: 0, startTime: 0 });

  // Subscribe to store changes via refs
  useEffect(() => {
    const unsub = useStore.subscribe((state) => {
      const prevCount = pulsesRef.current.length;
      pulsesRef.current = state.pulses;
      burstRef.current = { showing: state.showingBurst, sync: state.lastSync };
      activityRef.current = state.activityLevel;

      // Emit trail particles for newly added pulses
      if (state.pulses.length > prevCount) {
        const newPulses = state.pulses.slice(prevCount);
        for (const p of newPulses) {
          particleSystem.current.emitPulseTrail(p.x, p.y, p.color);
        }
      }
    });
    return unsub;
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (previewMode) return;
      if (e.clientY > height - 44) return;
      onPulse(e.clientX / width, e.clientY / height);
    },
    [width, height, onPulse, previewMode],
  );

  const handleTouch = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (previewMode) return;
      if (e.touches.length === 0) return;
      if (e.touches[0].clientY > height - 44) return;
      e.preventDefault();
      onPulse(e.touches[0].clientX / width, e.touches[0].clientY / height);
    },
    [width, height, onPulse, previewMode],
  );

  // Main animation loop — only depends on dimensions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ps = particleSystem.current;
    let raf: number;
    let lastBurstTime = 0;
    const isMobile = width < 768;

    const animate = () => {
      const now = Date.now();

      // Screen shake offset
      let shakeX = 0;
      let shakeY = 0;
      const shake = shakeRef.current;
      if (shake.intensity > 0) {
        const elapsed = now - shake.startTime;
        const decay = Math.max(0, 1 - elapsed / 300);
        const mag = shake.intensity * decay;
        shakeX = (Math.random() - 0.5) * mag;
        shakeY = (Math.random() - 0.5) * mag;
        if (decay <= 0) shake.intensity = 0;
      }

      ctx.save();
      ctx.translate(shakeX, shakeY);

      // Background: near-black with subtle color shift based on activity
      const activity = activityRef.current;
      const bgR = Math.floor(10 + activity * 8);
      const bgG = Math.floor(10 + activity * 4);
      const bgB = Math.floor(10 + activity * 12);
      ctx.fillStyle = `rgb(${bgR}, ${bgG}, ${bgB})`;
      ctx.fillRect(-10, -10, width + 20, height + 20);

      // Draw pulses
      const pulses = pulsesRef.current;
      const lifetime = 3500;

      for (const pulse of pulses) {
        const age = now - pulse.t;
        if (age > lifetime) continue;

        const progress = age / lifetime;
        const opacity = 1 - progress;

        // Outer expanding ring
        const radius = 6 + progress * 50;
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = hexWithAlpha(pulse.color, opacity * 0.6);
        ctx.lineWidth = 1;
        ctx.stroke();

        // Second ring (subtler, slightly delayed)
        if (progress > 0.1) {
          const r2 = 6 + (progress - 0.1) * 35;
          ctx.beginPath();
          ctx.arc(pulse.x, pulse.y, r2, 0, Math.PI * 2);
          ctx.strokeStyle = hexWithAlpha(pulse.color, opacity * 0.2);
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }

        // Core dot
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, 2.5 * opacity, 0, Math.PI * 2);
        ctx.fillStyle = hexWithAlpha(pulse.color, opacity);
        ctx.fill();
      }

      // Sync constellation effect
      const burst = burstRef.current;
      if (burst.showing && burst.sync) {
        const syncAge = now - burst.sync.t;
        const syncLifetime = 2000;

        if (syncAge < syncLifetime) {
          const syncOpacity = 1 - syncAge / syncLifetime;

          // Find positions of synced users
          const positions: { x: number; y: number; color: string }[] = [];
          for (const uid of burst.sync.userIds) {
            for (let i = pulses.length - 1; i >= 0; i--) {
              if (pulses[i].userId === uid) {
                positions.push({
                  x: pulses[i].x,
                  y: pulses[i].y,
                  color: pulses[i].color,
                });
                break;
              }
            }
          }

          if (positions.length >= 2) {
            // Emit burst particles once per sync
            if (burst.sync.t !== lastBurstTime) {
              lastBurstTime = burst.sync.t;
              ps.emitSyncBurst(positions, burst.sync.streak);

              // Screen shake for streaks > 3 (reduced on mobile)
              if (burst.sync.streak > 3) {
                const baseIntensity = Math.min(
                  4 + burst.sync.streak * 1.5,
                  20,
                );
                shakeRef.current = {
                  intensity: isMobile ? baseIntensity * 0.5 : baseIntensity,
                  startTime: now,
                };
              }
            }

            // Constellation lines
            ctx.globalAlpha = syncOpacity * 0.3;
            ctx.lineWidth = 0.5;
            for (let i = 0; i < positions.length; i++) {
              for (let j = i + 1; j < positions.length; j++) {
                ctx.beginPath();
                ctx.moveTo(positions[i].x, positions[i].y);
                ctx.lineTo(positions[j].x, positions[j].y);
                ctx.strokeStyle = '#ffffff';
                ctx.stroke();
              }
            }
            ctx.globalAlpha = 1;
          }
        }
      }

      // Particles
      ps.update(now);
      ps.render(ctx);

      ctx.restore();
      raf = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(raf);
  }, [width, height]);

  // Pulse cleanup
  useEffect(() => {
    const iv = setInterval(() => useStore.getState().clearOldPulses(), 1000);
    return () => clearInterval(iv);
  }, []);

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
