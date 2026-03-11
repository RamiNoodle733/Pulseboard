import { useEffect, useRef } from 'react';
import { useStore } from './store';
import type { Pulse, SyncEvent, Ripple } from './store';
import type { WorldSnapshot, WorldEvent } from './socket';
import { ParticleSystem } from './particles';

interface CanvasProps {
  width: number;
  height: number;
}

function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.floor(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return hex + a;
}

function cityToPosition(city: string, w: number, h: number): { x: number; y: number } {
  let hash = 0;
  for (let i = 0; i < city.length; i++) {
    hash = ((hash << 5) - hash + city.charCodeAt(i)) | 0;
  }
  const golden = 0.618033988749895;
  const x = ((Math.abs(hash) * golden) % 1) * w * 0.8 + w * 0.1;
  const y = ((Math.abs(hash * 2654435761) * golden) % 1) * h * 0.8 + h * 0.1;
  return { x, y };
}

export default function Canvas({ width, height }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particleSystem = useRef(new ParticleSystem());

  const pulsesRef = useRef<Pulse[]>([]);
  const burstRef = useRef<{ showing: boolean; sync: SyncEvent | null }>({
    showing: false,
    sync: null,
  });
  const activityRef = useRef(0);
  const shakeRef = useRef({ intensity: 0, startTime: 0 });
  const worldStateRef = useRef<WorldSnapshot | null>(null);
  const currentEventRef = useRef<WorldEvent | null>(null);
  const ripplesRef = useRef<Ripple[]>([]);

  useEffect(() => {
    const unsub = useStore.subscribe((state) => {
      const prevCount = pulsesRef.current.length;
      pulsesRef.current = state.pulses;
      burstRef.current = { showing: state.showingBurst, sync: state.lastSync };
      activityRef.current = state.activityLevel;
      worldStateRef.current = state.worldState;
      currentEventRef.current = state.currentEvent;
      ripplesRef.current = state.ripples;

      if (state.pulses.length > prevCount) {
        const newPulses = state.pulses.slice(prevCount);
        for (const p of newPulses) {
          particleSystem.current.emitPresenceTrail(p.x, p.y, p.color, p.energy);
        }
      }
    });
    return unsub;
  }, []);

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

      const activity = activityRef.current;
      const bgR = Math.floor(10 + activity * 8);
      const bgG = Math.floor(10 + activity * 4);
      const bgB = Math.floor(10 + activity * 12);
      ctx.fillStyle = `rgb(${bgR}, ${bgG}, ${bgB})`;
      ctx.fillRect(-10, -10, width + 20, height + 20);

      const gridSpacing = 100;
      const gridShift = (now * 0.005) % gridSpacing;
      const gridAlpha = 0.015 + activity * 0.01;
      ctx.strokeStyle = `rgba(255, 255, 255, ${gridAlpha})`;
      ctx.lineWidth = 0.5;
      for (let x = -gridSpacing + gridShift; x < width + gridSpacing; x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = -gridSpacing + gridShift; y < height + gridSpacing; y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      const waveAmplitude = 20;
      const waveFrequency = 0.02;
      ctx.fillStyle = 'rgba(0, 120, 255, 0.1)';
      for (let i = 0; i < width; i += 5) {
        const waveHeight = waveAmplitude * Math.sin(i * waveFrequency + now * 0.002);
        ctx.fillRect(i, height / 2 + waveHeight, 5, height / 2 - waveHeight);
      }

      const greenBlobX = width / 2;
      const greenBlobY = height / 2;
      const greenBlobRadius = 50;
      const greenGradient = ctx.createRadialGradient(greenBlobX, greenBlobY, 0, greenBlobX, greenBlobY, greenBlobRadius);
      greenGradient.addColorStop(0, 'rgba(0, 255, 0, 0.3)');
      greenGradient.addColorStop(1, 'rgba(0, 255, 0, 0)');

      ctx.fillStyle = greenGradient;
      ctx.fillRect(greenBlobX - greenBlobRadius, greenBlobY - greenBlobRadius, greenBlobRadius * 2, greenBlobRadius * 2);

      const ws = worldStateRef.current;
      if (ws && ws.cities.length > 0) {
        ctx.globalCompositeOperation = 'screen';
        for (const city of ws.cities) {
          if (city.energy < 0.5) continue;
          const pos = cityToPosition(city.city, width, height);
          const intensity = Math.min(1, city.energy / 200);
          const radius = 60 + intensity * 120;

          const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius);
          const alpha = 0.02 + intensity * 0.06;
          const phase = ws.phase.name;
          const r = phase === 'surging' ? 255 : phase === 'converging' ? 100 : 180;
          const g = phase === 'surging' ? 180 : phase === 'converging' ? 150 : 200;
          const b = phase === 'surging' ? 80 : phase === 'converging' ? 255 : 220;
          grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

          ctx.fillStyle = grad;
          ctx.fillRect(pos.x - radius, pos.y - radius, radius * 2, radius * 2);
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      const evt = currentEventRef.current;
      if (evt && now - evt.startedAt < evt.duration) {
        const eventProgress = (now - evt.startedAt) / evt.duration;
        const eventOpacity = (1 - eventProgress) * evt.intensity;

        if (evt.type === 'surge' && evt.cities.length > 0) {
          const pos = cityToPosition(evt.cities[0], width, height);
          const waveRadius = eventProgress * Math.max(width, height) * 0.5;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, waveRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 180, 80, ${eventOpacity * 0.15})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (evt.type === 'resonance_wave') {
          const waveRadius = eventProgress * Math.max(width, height) * 0.6;
          ctx.beginPath();
          ctx.arc(width / 2, height / 2, waveRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 255, 255, ${eventOpacity * 0.12})`;
          ctx.lineWidth = 3;
          ctx.stroke();
        } else if (evt.type === 'convergence' && evt.cities.length >= 2) {
          ctx.globalAlpha = eventOpacity * 0.1;
          ctx.strokeStyle = '#4ECDC4';
          ctx.lineWidth = 1;
          const positions = evt.cities.map((c) => cityToPosition(c, width, height));
          for (let i = 0; i < positions.length; i++) {
            for (let j = i + 1; j < positions.length; j++) {
              ctx.beginPath();
              ctx.moveTo(positions[i].x, positions[i].y);
              ctx.lineTo(positions[j].x, positions[j].y);
              ctx.stroke();
            }
          }
          ctx.globalAlpha = 1;
        }
      }

      const ripples = ripplesRef.current;
      const rippleLifetime = 800;
      ctx.globalCompositeOperation = 'screen';
      for (const ripple of ripples) {
        const age = now - ripple.t;
        if (age > rippleLifetime) continue;
        const progress = age / rippleLifetime;
        const radius = ripple.maxRadius * progress;
        const opacity = (1 - progress) * 0.15;
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = hexWithAlpha(ripple.color, opacity);
        ctx.lineWidth = 1.5 * (1 - progress);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';

      const pulses = pulsesRef.current;
      const lifetime = 2500;

      ctx.globalCompositeOperation = 'screen';
      for (const pulse of pulses) {
        const age = now - pulse.t;
        if (age > lifetime) continue;

        const progress = age / lifetime;
        const opacity = 1 - progress;
        const energy = pulse.energy || 1;

        const blobRadius = (4 + energy * 8) + progress * (20 + energy * 30);
        const grad = ctx.createRadialGradient(pulse.x, pulse.y, 0, pulse.x, pulse.y, blobRadius);
        grad.addColorStop(0, hexWithAlpha(pulse.color, opacity * 0.5 * energy));
        grad.addColorStop(0.5, hexWithAlpha(pulse.color, opacity * 0.2 * energy));
        grad.addColorStop(1, hexWithAlpha(pulse.color, 0));
        ctx.fillStyle = grad;
        ctx.fillRect(pulse.x - blobRadius, pulse.y - blobRadius, blobRadius * 2, blobRadius * 2);

        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, (2 + energy * 1.5) * opacity, 0, Math.PI * 2);
        ctx.fillStyle = hexWithAlpha(pulse.color, opacity * 0.9);
        ctx.fill();

        const ringRadius = 6 + progress * 40 * energy;
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = hexWithAlpha(pulse.color, opacity * 0.3);
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';

      const burst = burstRef.current;
      if (burst.showing && burst.sync) {
        const syncAge = now - burst.sync.t;
        const syncLifetime = 2000;

        if (syncAge < syncLifetime) {
          const syncOpacity = 1 - syncAge / syncLifetime;

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
            if (burst.sync.t !== lastBurstTime) {
              lastBurstTime = burst.sync.t;
              ps.emitSyncBurst(positions, burst.sync.streak);

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

      ps.update(now);
      ps.render(ctx);

      ctx.restore();
      raf = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(raf);
  }, [width, height]);

  useEffect(() => {
    const iv = setInterval(() => {
      useStore.getState().clearOldPulses();
      useStore.getState().clearOldRipples();
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0"
    />
  );
}
