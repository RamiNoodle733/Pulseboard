import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export interface CityStats {
  pulses: number;
  syncs: number;
}

export interface GlobalStats {
  totalPulses: number;
  totalSyncs: number;
  bestStreakAllTime: number;
  cities: Record<string, CityStats>;
  lastSaved: number;
}

export interface GlobalStatsPayload {
  totalPulses: number;
  totalSyncs: number;
  bestStreakAllTime: number;
  activeCities: number;
  topCities: Array<{ city: string; pulses: number; syncs: number }>;
  pulsesPerMinute: number;
}

const STATS_PATH = './data/stats.json';
const SAVE_INTERVAL = 30_000;

export function createStatsManager() {
  let stats: GlobalStats = loadOrDefault();
  let saveTimer: ReturnType<typeof setInterval> | null = null;
  const pulseTimestamps: number[] = [];

  function loadOrDefault(): GlobalStats {
    try {
      if (existsSync(STATS_PATH)) {
        const raw = readFileSync(STATS_PATH, 'utf-8');
        return JSON.parse(raw) as GlobalStats;
      }
    } catch (err) {
      console.error('[stats] failed to load, starting fresh:', err);
    }
    return { totalPulses: 0, totalSyncs: 0, bestStreakAllTime: 0, cities: {}, lastSaved: 0 };
  }

  function save(): void {
    try {
      const dir = dirname(STATS_PATH);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      stats.lastSaved = Date.now();
      writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2), 'utf-8');
      console.log(`[stats] saved (${stats.totalPulses} pulses, ${stats.totalSyncs} syncs)`);
    } catch (err) {
      console.error('[stats] failed to save:', err);
    }
  }

  function startAutoSave(): void {
    saveTimer = setInterval(save, SAVE_INTERVAL);
  }

  function shutdown(): void {
    if (saveTimer) clearInterval(saveTimer);
    save();
  }

  function recordPulse(city: string, now: number): void {
    stats.totalPulses++;
    pulseTimestamps.push(now);
    // Prune timestamps older than 60s
    const cutoff = now - 60_000;
    while (pulseTimestamps.length > 0 && pulseTimestamps[0] < cutoff) {
      pulseTimestamps.shift();
    }
    if (city) {
      if (!stats.cities[city]) stats.cities[city] = { pulses: 0, syncs: 0 };
      stats.cities[city].pulses++;
    }
  }

  function recordSync(cities: string[], streak: number): void {
    stats.totalSyncs++;
    stats.bestStreakAllTime = Math.max(stats.bestStreakAllTime, streak);
    for (const city of cities) {
      if (city) {
        if (!stats.cities[city]) stats.cities[city] = { pulses: 0, syncs: 0 };
        stats.cities[city].syncs++;
      }
    }
  }

  function getPulsesPerMinute(): number {
    const now = Date.now();
    const cutoff = now - 60_000;
    let count = 0;
    for (let i = pulseTimestamps.length - 1; i >= 0; i--) {
      if (pulseTimestamps[i] >= cutoff) count++;
      else break;
    }
    return count;
  }

  function getTopCities(n: number): Array<{ city: string; pulses: number; syncs: number }> {
    return Object.entries(stats.cities)
      .map(([city, s]) => ({ city, pulses: s.pulses, syncs: s.syncs }))
      .sort((a, b) => b.pulses - a.pulses)
      .slice(0, n);
  }

  function getSnapshot(): GlobalStats {
    return { ...stats };
  }

  return {
    startAutoSave,
    shutdown,
    recordPulse,
    recordSync,
    getPulsesPerMinute,
    getTopCities,
    getSnapshot,
  };
}
