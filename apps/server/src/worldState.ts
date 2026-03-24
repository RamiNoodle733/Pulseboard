import { haversineKm } from './haversine.js';

export interface CityNode {
  city: string;
  lat: number;
  lon: number;
  energy: number;
  momentum: number;
  resonanceCount: number;
  lastActivity: number;
}

export type WorldPhaseName = 'surging' | 'cooling' | 'converging' | 'dormant' | 'active';

export interface WorldPhase {
  name: WorldPhaseName;
  intensity: number;
  startedAt: number;
}

export interface WorldSnapshot {
  totalEnergy: number;
  cities: Array<{
    city: string;
    energy: number;
    momentum: number;
    lat: number;
    lon: number;
  }>;
  phase: WorldPhase;
  hotZones: string[];
  risingCities: string[];
}

const DECAY_RATE = 0.98;
const DIFFUSION_RATE = 0.05;
const DIFFUSION_RADIUS_KM = 500;

export function createWorldStateManager() {
  const cityNodes = new Map<string, CityNode>();
  let totalEnergyEver = 0;
  let previousTotalEnergy = 0;
  let currentPhase: WorldPhase = { name: 'active', intensity: 0, startedAt: Date.now() };

  function getOrCreateCity(city: string, lat: number, lon: number): CityNode {
    let node = cityNodes.get(city);
    if (!node) {
      node = { city, lat, lon, energy: 0, momentum: 0, resonanceCount: 0, lastActivity: 0 };
      cityNodes.set(city, node);
    }
    return node;
  }

  function addEnergy(city: string, lat: number, lon: number, energy: number): void {
    const node = getOrCreateCity(city, lat, lon);
    node.energy += energy * 0.1;
    node.lastActivity = Date.now();
    totalEnergyEver += energy * 0.1;
  }

  function addResonance(cities: string[]): void {
    for (const city of cities) {
      const node = cityNodes.get(city);
      if (node) node.resonanceCount++;
    }
  }

  function tick(): void {
    const nodes = Array.from(cityNodes.values());

    // Decay
    for (const node of nodes) {
      node.energy *= DECAY_RATE;
    }

    // Influence diffusion
    const diffusionDeltas = new Map<string, number>();
    for (const source of nodes) {
      if (source.energy < 1) continue;
      for (const target of nodes) {
        if (source.city === target.city) continue;
        if (source.lat === 0 && source.lon === 0) continue;
        if (target.lat === 0 && target.lon === 0) continue;
        const dist = haversineKm(source.lat, source.lon, target.lat, target.lon);
        if (dist < DIFFUSION_RADIUS_KM) {
          const amount = source.energy * DIFFUSION_RATE * (1 - dist / DIFFUSION_RADIUS_KM);
          diffusionDeltas.set(target.city, (diffusionDeltas.get(target.city) || 0) + amount);
        }
      }
    }
    for (const [city, delta] of diffusionDeltas) {
      const node = cityNodes.get(city);
      if (node) node.energy += delta;
    }

    // Update momentum (EMA)
    const currentTotal = getTotalEnergy();
    for (const node of nodes) {
      const prevMomentum = node.momentum;
      const instantMomentum = node.energy - (previousTotalEnergy > 0 ? node.energy / (currentTotal / previousTotalEnergy || 1) : 0);
      node.momentum = prevMomentum * 0.9 + instantMomentum * 0.1;
    }
    previousTotalEnergy = currentTotal;

    // Update phase
    updatePhase(currentTotal, nodes);

    // Prune dead cities
    for (const [city, node] of cityNodes) {
      if (node.energy < 0.01 && Date.now() - node.lastActivity > 300_000) {
        cityNodes.delete(city);
      }
    }
  }

  function getTotalEnergy(): number {
    let total = 0;
    for (const node of cityNodes.values()) {
      total += node.energy;
    }
    return total;
  }

  function updatePhase(totalEnergy: number, nodes: CityNode[]): void {
    const activeCities = nodes.filter((n) => n.energy > 100).length;
    const avgMomentum = nodes.length > 0
      ? nodes.reduce((sum, n) => sum + n.momentum, 0) / nodes.length
      : 0;

    let newPhase: WorldPhaseName;
    let intensity: number;

    if (totalEnergy > 1000 && avgMomentum > 0) {
      newPhase = 'surging';
      intensity = Math.min(1, totalEnergy / 5000);
    } else if (totalEnergy > 500 && avgMomentum < 0) {
      newPhase = 'cooling';
      intensity = Math.min(1, totalEnergy / 2000);
    } else if (activeCities >= 3) {
      newPhase = 'converging';
      intensity = Math.min(1, activeCities / 10);
    } else if (totalEnergy < 100) {
      newPhase = 'dormant';
      intensity = Math.max(0, totalEnergy / 100);
    } else {
      newPhase = 'active';
      intensity = Math.min(1, totalEnergy / 1000);
    }

    if (newPhase !== currentPhase.name) {
      currentPhase = { name: newPhase, intensity, startedAt: Date.now() };
    } else {
      currentPhase.intensity = intensity;
    }
  }

  function getSnapshot(): WorldSnapshot {
    const nodes = Array.from(cityNodes.values());
    const sorted = [...nodes].sort((a, b) => b.energy - a.energy);

    return {
      totalEnergy: Math.round(getTotalEnergy() * 100) / 100,
      cities: sorted.slice(0, 20).map((n) => ({
        city: n.city,
        energy: Math.round(n.energy * 100) / 100,
        momentum: Math.round(n.momentum * 100) / 100,
        lat: n.lat,
        lon: n.lon,
      })),
      phase: { ...currentPhase },
      hotZones: sorted.slice(0, 3).filter((n) => n.energy > 10).map((n) => n.city),
      risingCities: [...nodes]
        .sort((a, b) => b.momentum - a.momentum)
        .slice(0, 3)
        .filter((n) => n.momentum > 0)
        .map((n) => n.city),
    };
  }

  function getTotalEnergyEver(): number {
    return totalEnergyEver;
  }

  return {
    addEnergy,
    addResonance,
    tick,
    getSnapshot,
    getTotalEnergy,
    getTotalEnergyEver,
    getPhase: () => currentPhase,
  };
}
