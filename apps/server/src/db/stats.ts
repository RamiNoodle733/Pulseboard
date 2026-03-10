import pg from 'pg';

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

const FLUSH_INTERVAL = 10_000;

export function createDBStatsManager(pool: pg.Pool) {
  // In-memory cache (fast path for reads & writes)
  let stats: GlobalStats = {
    totalPulses: 0,
    totalSyncs: 0,
    bestStreakAllTime: 0,
    cities: {},
    lastSaved: 0,
  };

  // Buffered deltas since last flush
  let deltaPulses = 0;
  let deltaSyncs = 0;
  let deltaStreak = 0;
  const cityDeltas: Record<string, { pulses: number; syncs: number; lat: number; lon: number }> = {};

  const pulseTimestamps: number[] = [];
  let flushTimer: ReturnType<typeof setInterval> | null = null;

  async function loadFromDB(): Promise<void> {
    try {
      const { rows } = await pool.query(
        'SELECT total_pulses, total_syncs, best_streak_all_time FROM global_stats WHERE id = 1',
      );
      if (rows.length > 0) {
        stats.totalPulses = Number(rows[0].total_pulses);
        stats.totalSyncs = Number(rows[0].total_syncs);
        stats.bestStreakAllTime = Number(rows[0].best_streak_all_time);
      }

      const { rows: cityRows } = await pool.query(
        'SELECT city, pulses, syncs FROM city_stats',
      );
      for (const row of cityRows) {
        stats.cities[row.city] = {
          pulses: Number(row.pulses),
          syncs: Number(row.syncs),
        };
      }
      console.log(`[stats:db] loaded ${stats.totalPulses} pulses, ${Object.keys(stats.cities).length} cities`);
    } catch (err) {
      console.error('[stats:db] failed to load from DB:', err);
    }
  }

  async function flush(): Promise<void> {
    if (deltaPulses === 0 && deltaSyncs === 0 && deltaStreak === 0 && Object.keys(cityDeltas).length === 0) {
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (deltaPulses > 0 || deltaSyncs > 0 || deltaStreak > 0) {
        await client.query(
          `UPDATE global_stats SET
            total_pulses = total_pulses + $1,
            total_syncs = total_syncs + $2,
            best_streak_all_time = GREATEST(best_streak_all_time, $3),
            updated_at = NOW()
          WHERE id = 1`,
          [deltaPulses, deltaSyncs, deltaStreak],
        );
      }

      for (const [city, d] of Object.entries(cityDeltas)) {
        await client.query(
          `INSERT INTO city_stats (city, pulses, syncs, lat, lon, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (city) DO UPDATE SET
             pulses = city_stats.pulses + EXCLUDED.pulses,
             syncs = city_stats.syncs + EXCLUDED.syncs,
             updated_at = NOW()`,
          [city, d.pulses, d.syncs, d.lat, d.lon],
        );
      }

      await client.query('COMMIT');

      deltaPulses = 0;
      deltaSyncs = 0;
      deltaStreak = 0;
      for (const key of Object.keys(cityDeltas)) delete cityDeltas[key];
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[stats:db] flush failed:', err);
    } finally {
      client.release();
    }
  }

  function startAutoSave(): void {
    flushTimer = setInterval(() => { flush().catch(console.error); }, FLUSH_INTERVAL);
  }

  async function shutdown(): Promise<void> {
    if (flushTimer) clearInterval(flushTimer);
    await flush();
    console.log('[stats:db] flushed on shutdown');
  }

  function recordPulse(city: string, now: number): void {
    stats.totalPulses++;
    deltaPulses++;
    pulseTimestamps.push(now);
    const cutoff = now - 60_000;
    while (pulseTimestamps.length > 0 && pulseTimestamps[0] < cutoff) {
      pulseTimestamps.shift();
    }
    if (city) {
      if (!stats.cities[city]) stats.cities[city] = { pulses: 0, syncs: 0 };
      stats.cities[city].pulses++;
      if (!cityDeltas[city]) cityDeltas[city] = { pulses: 0, syncs: 0, lat: 0, lon: 0 };
      cityDeltas[city].pulses++;
    }
  }

  function recordPulseWithGeo(city: string, lat: number, lon: number, now: number): void {
    stats.totalPulses++;
    deltaPulses++;
    pulseTimestamps.push(now);
    const cutoff = now - 60_000;
    while (pulseTimestamps.length > 0 && pulseTimestamps[0] < cutoff) {
      pulseTimestamps.shift();
    }
    if (city) {
      if (!stats.cities[city]) stats.cities[city] = { pulses: 0, syncs: 0 };
      stats.cities[city].pulses++;
      if (!cityDeltas[city]) cityDeltas[city] = { pulses: 0, syncs: 0, lat: 0, lon: 0 };
      cityDeltas[city].pulses++;
      cityDeltas[city].lat = lat;
      cityDeltas[city].lon = lon;
    }
  }

  function recordSync(cities: string[], streak: number): void {
    stats.totalSyncs++;
    deltaSyncs++;
    stats.bestStreakAllTime = Math.max(stats.bestStreakAllTime, streak);
    deltaStreak = Math.max(deltaStreak, streak);
    for (const city of cities) {
      if (city) {
        if (!stats.cities[city]) stats.cities[city] = { pulses: 0, syncs: 0 };
        stats.cities[city].syncs++;
        if (!cityDeltas[city]) cityDeltas[city] = { pulses: 0, syncs: 0, lat: 0, lon: 0 };
        cityDeltas[city].syncs++;
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
    loadFromDB,
    startAutoSave,
    shutdown,
    recordPulse,
    recordPulseWithGeo,
    recordSync,
    getPulsesPerMinute,
    getTopCities,
    getSnapshot,
  };
}
