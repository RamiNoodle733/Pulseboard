import { useEffect, useRef } from 'react';
import { useStore } from './store';
import type { Pulse, SyncEvent, Ripple } from './store';
import type { WorldSnapshot, WorldEvent, TerritorySnapshot } from './socket';
import { ParticleSystem } from './particles';
import { getWorldPaths, geoToCanvas } from './mapData/worldMap';

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

const cityGeoCache = new Map<string, { lat: number; lon: number }>();

function getCityPos(city: string, width: number, height: number): { x: number; y: number } | null {
  const geo = cityGeoCache.get(city);
  if (geo && (geo.lat !== 0 || geo.lon !== 0)) {
    return geoToCanvas(geo.lat, geo.lon, width, height);
  }
  return null;
}

function cityToPositionFallback(city: string, w: number, h: number): { x: number; y: number } {
  let hash = 0;
  for (let i = 0; i < city.length; i++) {
    hash = ((hash << 5) - hash + city.charCodeAt(i)) | 0;
  }
  const golden = 0.618033988749895;
  const x = ((Math.abs(hash) * golden) % 1) * w * 0.8 + w * 0.1;
  const y = ((Math.abs(hash * 2654435761) * golden) % 1) * h * 0.8 + h * 0.1;
  return { x, y };
}

function getCityCanvasPos(city: string, w: number, h: number): { x: number; y: number } {
  return getCityPos(city, w, h) || cityToPositionFallback(city, w, h);
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
  const territoryRef = useRef<TerritorySnapshot | null>(null);
  const myCityRef = useRef('');

  useEffect(() => {
    const unsub = useStore.subscribe((state) => {
      const prevCount = pulsesRef.current.length;
      pulsesRef.current = state.pulses;
      burstRef.current = { showing: state.showingBurst, sync: state.lastSync };
      activityRef.current = state.activityLevel;
      worldStateRef.current = state.worldState;
      currentEventRef.current = state.currentEvent;
      ripplesRef.current = state.ripples;
      territoryRef.current = state.territoryData;
      myCityRef.current = state.myCity;

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

    const worldPaths = getWorldPaths(width, height);

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
      const bgR = Math.floor(7 + activity * 5);
      const bgG = Math.floor(7 + activity * 3);
      const bgB = Math.floor(10 + activity * 8);
      ctx.fillStyle = `rgb(${bgR}, ${bgG}, ${bgB})`;
      ctx.fillRect(-10, -10, width + 20, height + 20);

      // Subtle vignette
      const vignette = ctx.createRadialGradient(
        width / 2, height / 2, Math.min(width, height) * 0.3,
        width / 2, height / 2, Math.max(width, height) * 0.75,
      );
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);

      // World map outlines
      ctx.strokeStyle = `rgba(255, 255, 255, 0.03)`;
      ctx.lineWidth = 0.6;
      ctx.fillStyle = `rgba(255, 255, 255, 0.01)`;
      for (const path of worldPaths) {
        ctx.fill(path);
        ctx.stroke(path);
      }

      // Subtle latitude lines
      const gridAlpha = 0.008 + activity * 0.004;
      ctx.strokeStyle = `rgba(255, 255, 255, ${gridAlpha})`;
      ctx.lineWidth = 0.3;
      for (let lat = -60; lat <= 70; lat += 30) {
        const { y } = geoToCanvas(lat, -180, width, height);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // City heat zones
      const territory = territoryRef.current;
      const ws = worldStateRef.current;

      if (ws && ws.cities.length > 0) {
        ctx.globalCompositeOperation = 'screen';
        const phase = ws.phase.name;

        for (const city of ws.cities) {
          if (city.energy < 0.5) continue;
          const pos = getCityCanvasPos(city.city, width, height);
          const intensity = Math.min(1, city.energy / 200);
          const radius = 35 + intensity * 110;

          const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius);
          const alpha = 0.02 + intensity * 0.06;
          const r = phase === 'surging' ? 255 : phase === 'converging' ? 80 : 160;
          const g = phase === 'surging' ? 160 : phase === 'converging' ? 140 : 180;
          const b = phase === 'surging' ? 60 : phase === 'converging' ? 255 : 240;
          grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
          grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha * 0.25})`);
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

          ctx.fillStyle = grad;
          ctx.fillRect(pos.x - radius, pos.y - radius, radius * 2, radius * 2);

          // City labels
          if (intensity > 0.3 && !isMobile) {
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.35, intensity * 0.4)})`;
            ctx.font = '500 8px "Inter", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(city.city.toUpperCase(), pos.x, pos.y + radius * 0.3 + 14);
          }
        }

        // Country glow
        if (territory) {
          for (const country of territory.topCountries) {
            if (country.energy < 1) continue;
            const countryIntensity = Math.min(1, country.energy / 500);
            if (countryIntensity < 0.05) continue;
            const matchCity = ws.cities.find((c) => c.city.includes(country.name));
            if (matchCity) {
              const cPos = getCityCanvasPos(matchCity.city, width, height);
              const cRadius = 100 + countryIntensity * 200;
              const cGrad = ctx.createRadialGradient(cPos.x, cPos.y, 0, cPos.x, cPos.y, cRadius);
              cGrad.addColorStop(0, `rgba(100, 150, 255, ${countryIntensity * 0.012})`);
              cGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
              ctx.fillStyle = cGrad;
              ctx.fillRect(cPos.x - cRadius, cPos.y - cRadius, cRadius * 2, cRadius * 2);
            }
          }
        }

        ctx.globalCompositeOperation = 'source-over';
      }

      // My city marker
      const myCity = myCityRef.current;
      if (myCity) {
        const myPos = getCityCanvasPos(myCity, width, height);
        const pulse = Math.sin(now * 0.003) * 0.5 + 0.5;
        const ringRadius = 6 + pulse * 5;

        // Outer glow
        const myGlow = ctx.createRadialGradient(myPos.x, myPos.y, 0, myPos.x, myPos.y, ringRadius * 3);
        myGlow.addColorStop(0, `rgba(255, 255, 255, ${0.03 + pulse * 0.02})`);
        myGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = myGlow;
        ctx.fillRect(myPos.x - ringRadius * 3, myPos.y - ringRadius * 3, ringRadius * 6, ringRadius * 6);

        ctx.beginPath();
        ctx.arc(myPos.x, myPos.y, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.12 + pulse * 0.08})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(myPos.x, myPos.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, 0.6)`;
        ctx.fill();
      }

      // World events
      const evt = currentEventRef.current;
      if (evt && now - evt.startedAt < evt.duration) {
        const eventProgress = (now - evt.startedAt) / evt.duration;
        const eventOpacity = (1 - eventProgress) * evt.intensity;

        if (evt.type === 'surge' && evt.cities.length > 0) {
          const pos = getCityCanvasPos(evt.cities[0], width, height);
          const waveRadius = eventProgress * Math.max(width, height) * 0.5;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, waveRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 180, 80, ${eventOpacity * 0.12})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (evt.type === 'resonance_wave') {
          const waveRadius = eventProgress * Math.max(width, height) * 0.6;
          ctx.beginPath();
          ctx.arc(width / 2, height / 2, waveRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 255, 255, ${eventOpacity * 0.08})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (evt.type === 'convergence' && evt.cities.length >= 2) {
          ctx.globalAlpha = eventOpacity * 0.08;
          ctx.strokeStyle = '#4ECDC4';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          const positions = evt.cities.map((c) => getCityCanvasPos(c, width, height));
          for (let i = 0; i < positions.length; i++) {
            for (let j = i + 1; j < positions.length; j++) {
              ctx.beginPath();
              ctx.moveTo(positions[i].x, positions[i].y);
              ctx.lineTo(positions[j].x, positions[j].y);
              ctx.stroke();
            }
          }
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
      }

      // Ripples
      const ripples = ripplesRef.current;
      const rippleLifetime = 800;
      ctx.globalCompositeOperation = 'screen';
      for (const ripple of ripples) {
        const age = now - ripple.t;
        if (age > rippleLifetime) continue;
        const progress = age / rippleLifetime;
        const radius = ripple.maxRadius * progress;
        const opacity = (1 - progress) * 0.12;
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = hexWithAlpha(ripple.color, opacity);
        ctx.lineWidth = 1.2 * (1 - progress);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';

      // Pulses
      const pulses = pulsesRef.current;
      const lifetime = 2500;

      ctx.globalCompositeOperation = 'screen';
      for (const pulse of pulses) {
        const age = now - pulse.t;
        if (age > lifetime) continue;

        const progress = age / lifetime;
        const opacity = (1 - progress) * (1 - progress); // quadratic fade
        const energy = pulse.energy || 1;

        // Energy blob
        const blobRadius = (3 + energy * 7) + progress * (18 + energy * 28);
        const grad = ctx.createRadialGradient(pulse.x, pulse.y, 0, pulse.x, pulse.y, blobRadius);
        grad.addColorStop(0, hexWithAlpha(pulse.color, opacity * 0.45 * energy));
        grad.addColorStop(0.4, hexWithAlpha(pulse.color, opacity * 0.15 * energy));
        grad.addColorStop(1, hexWithAlpha(pulse.color, 0));
        ctx.fillStyle = grad;
        ctx.fillRect(pulse.x - blobRadius, pulse.y - blobRadius, blobRadius * 2, blobRadius * 2);

        // Core dot
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, (1.5 + energy) * opacity, 0, Math.PI * 2);
        ctx.fillStyle = hexWithAlpha(pulse.color, opacity * 0.85);
        ctx.fill();

        // Outer ring
        const ringRadius = 5 + progress * 35 * energy;
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = hexWithAlpha(pulse.color, opacity * 0.2);
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';

      // Sync constellation
      const burst = burstRef.current;
      if (burst.showing && burst.sync) {
        const syncAge = now - burst.sync.t;
        const syncLifetime = 2000;

        if (syncAge < syncLifetime) {
          const syncOpacity = (1 - syncAge / syncLifetime) * (1 - syncAge / syncLifetime);

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
                const baseIntensity = Math.min(4 + burst.sync.streak * 1.5, 20);
                shakeRef.current = {
                  intensity: isMobile ? baseIntensity * 0.5 : baseIntensity,
                  startTime: now,
                };
              }
            }

            // Constellation lines
            ctx.globalAlpha = syncOpacity * 0.2;
            ctx.lineWidth = 0.5;
            ctx.setLineDash([2, 3]);
            for (let i = 0; i < positions.length; i++) {
              for (let j = i + 1; j < positions.length; j++) {
                ctx.beginPath();
                ctx.moveTo(positions[i].x, positions[i].y);
                ctx.lineTo(positions[j].x, positions[j].y);
                ctx.strokeStyle = '#ffffff';
                ctx.stroke();
              }
            }
            ctx.setLineDash([]);
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
