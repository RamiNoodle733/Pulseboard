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

// City lat/lon lookup cache (populated from world state data)
const cityGeoCache = new Map<string, { lat: number; lon: number }>();

function getCityPos(city: string, width: number, height: number): { x: number; y: number } | null {
  const geo = cityGeoCache.get(city);
  if (geo && (geo.lat !== 0 || geo.lon !== 0)) {
    return geoToCanvas(geo.lat, geo.lon, width, height);
  }
  return null;
}

// Fallback: deterministic hash for cities without geo data
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

  // Refs for animation data
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
  const myLatRef = useRef(0);
  const myLonRef = useRef(0);

  // Subscribe to store changes via refs
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
      myLatRef.current = state.myLat;
      myLonRef.current = state.myLon;

      // Emit trail particles for newly added pulses
      if (state.pulses.length > prevCount) {
        const newPulses = state.pulses.slice(prevCount);
        for (const p of newPulses) {
          particleSystem.current.emitPresenceTrail(p.x, p.y, p.color, p.energy);
        }
      }
    });
    return unsub;
  }, []);

  // Main animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ps = particleSystem.current;
    let raf: number;
    let lastBurstTime = 0;
    const isMobile = width < 768;

    // Pre-build world map paths for this size
    const worldPaths = getWorldPaths(width, height);

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
      const bgR = Math.floor(8 + activity * 6);
      const bgG = Math.floor(8 + activity * 3);
      const bgB = Math.floor(12 + activity * 8);
      ctx.fillStyle = `rgb(${bgR}, ${bgG}, ${bgB})`;
      ctx.fillRect(-10, -10, width + 20, height + 20);

      // World map outlines (dim white continent strokes)
      ctx.strokeStyle = `rgba(255, 255, 255, 0.04)`;
      ctx.lineWidth = 0.8;
      ctx.fillStyle = `rgba(255, 255, 255, 0.015)`;
      for (const path of worldPaths) {
        ctx.fill(path);
        ctx.stroke(path);
      }

      // Subtle latitude lines
      const gridAlpha = 0.012 + activity * 0.005;
      ctx.strokeStyle = `rgba(255, 255, 255, ${gridAlpha})`;
      ctx.lineWidth = 0.3;
      for (let lat = -60; lat <= 70; lat += 30) {
        const { y } = geoToCanvas(lat, -180, width, height);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Territory / city heat zones on real geography
      const territory = territoryRef.current;
      const ws = worldStateRef.current;

      // Build city geo cache from territory data
      if (territory) {
        for (const t of territory.territories) {
          if (t.type === 'city' && t.energy > 0) {
            // Territory data doesn't carry lat/lon to client, rely on worldState
          }
        }
      }

      // Use worldState cities for geographic glow
      if (ws && ws.cities.length > 0) {
        ctx.globalCompositeOperation = 'screen';
        const phase = ws.phase.name;

        for (const city of ws.cities) {
          if (city.energy < 0.5) continue;
          const pos = getCityCanvasPos(city.city, width, height);
          const intensity = Math.min(1, city.energy / 200);
          const radius = 40 + intensity * 100;

          const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius);
          const alpha = 0.025 + intensity * 0.07;
          const r = phase === 'surging' ? 255 : phase === 'converging' ? 80 : 160;
          const g = phase === 'surging' ? 160 : phase === 'converging' ? 140 : 180;
          const b = phase === 'surging' ? 60 : phase === 'converging' ? 255 : 240;
          grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
          grad.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${alpha * 0.3})`);
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

          ctx.fillStyle = grad;
          ctx.fillRect(pos.x - radius, pos.y - radius, radius * 2, radius * 2);

          // City label for hot zones
          if (intensity > 0.3 && !isMobile) {
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.4, intensity * 0.5)})`;
            ctx.font = '9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(city.city, pos.x, pos.y + radius * 0.3 + 12);
          }
        }

        // Territory top countries glow (broader, dimmer)
        if (territory) {
          for (const country of territory.topCountries) {
            if (country.energy < 1) continue;
            // Use center-of-mass approximation — just a broad glow
            const countryIntensity = Math.min(1, country.energy / 500);
            if (countryIntensity < 0.05) continue;
            // Country glow uses the first matching city position as anchor
            const matchCity = ws.cities.find((c) => c.city.includes(country.name));
            if (matchCity) {
              const cPos = getCityCanvasPos(matchCity.city, width, height);
              const cRadius = 100 + countryIntensity * 200;
              const cGrad = ctx.createRadialGradient(cPos.x, cPos.y, 0, cPos.x, cPos.y, cRadius);
              cGrad.addColorStop(0, `rgba(100, 150, 255, ${countryIntensity * 0.015})`);
              cGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
              ctx.fillStyle = cGrad;
              ctx.fillRect(cPos.x - cRadius, cPos.y - cRadius, cRadius * 2, cRadius * 2);
            }
          }
        }

        ctx.globalCompositeOperation = 'source-over';
      }

      // My city pulsing ring marker
      const myCity = myCityRef.current;
      const myLat = myLatRef.current;
      const myLon = myLonRef.current;

      // Use direct lat/lon if available, otherwise fall back to city lookup
      let myPos: { x: number; y: number } | null = null;
      if (myLat !== 0 || myLon !== 0) {
        myPos = geoToCanvas(myLat, myLon, width, height);
      } else if (myCity) {
        myPos = getCityCanvasPos(myCity, width, height);
      }

      if (myPos) {
        const pulse = Math.sin(now * 0.003) * 0.5 + 0.5;
        const ringRadius = 8 + pulse * 6;
        ctx.beginPath();
        ctx.arc(myPos.x, myPos.y, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.15 + pulse * 0.1})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Inner dot
        ctx.beginPath();
        ctx.arc(myPos.x, myPos.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, 0.5)`;
        ctx.fill();
      }

      // World event visual effects
      const evt = currentEventRef.current;
      if (evt && now - evt.startedAt < evt.duration) {
        const eventProgress = (now - evt.startedAt) / evt.duration;
        const eventOpacity = (1 - eventProgress) * evt.intensity;

        if (evt.type === 'surge' && evt.cities.length > 0) {
          const pos = getCityCanvasPos(evt.cities[0], width, height);
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
          const positions = evt.cities.map((c) => getCityCanvasPos(c, width, height));
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

      // Local ripple effects
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

      // Draw pulses as energy blobs
      const pulses = pulsesRef.current;
      const lifetime = 2500;

      ctx.globalCompositeOperation = 'screen';
      for (const pulse of pulses) {
        const age = now - pulse.t;
        if (age > lifetime) continue;

        const progress = age / lifetime;
        const opacity = 1 - progress;
        const energy = pulse.energy || 1;

        // Energy blob (gradient circle)
        const blobRadius = (4 + energy * 8) + progress * (20 + energy * 30);
        const grad = ctx.createRadialGradient(pulse.x, pulse.y, 0, pulse.x, pulse.y, blobRadius);
        grad.addColorStop(0, hexWithAlpha(pulse.color, opacity * 0.5 * energy));
        grad.addColorStop(0.5, hexWithAlpha(pulse.color, opacity * 0.2 * energy));
        grad.addColorStop(1, hexWithAlpha(pulse.color, 0));
        ctx.fillStyle = grad;
        ctx.fillRect(pulse.x - blobRadius, pulse.y - blobRadius, blobRadius * 2, blobRadius * 2);

        // Core dot
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, (2 + energy * 1.5) * opacity, 0, Math.PI * 2);
        ctx.fillStyle = hexWithAlpha(pulse.color, opacity * 0.9);
        ctx.fill();

        // Outer ring
        const ringRadius = 6 + progress * 40 * energy;
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = hexWithAlpha(pulse.color, opacity * 0.3);
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';

      // Sync constellation effect
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
