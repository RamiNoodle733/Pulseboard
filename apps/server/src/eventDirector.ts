import pg from 'pg';
import type { WorldSnapshot } from './worldState.js';
import type { TerritorySnapshot } from './territory.js';

export interface WorldEvent {
  id: string;
  type: 'surge' | 'convergence' | 'resonance_wave' | 'city_awakening' | 'quiet_zone' | 'record_broken' | 'territory_war' | 'cascade' | 'awakening_wave';
  title: string;
  cities: string[];
  startedAt: number;
  duration: number;
  intensity: number;
}

interface CityTracker {
  energy: number;
  lastEnergy: number;
  lastUpdate: number;
  wasZero: boolean;
  zeroSince: number;
}

export function createEventDirector(pool?: pg.Pool | null) {
  let currentEvent: WorldEvent | null = null;
  let eventCounter = 0;
  let lastAllTimeEnergy = 0;
  let lastAllTimeStreak = 0;
  let quietSince = 0;
  const cityTrackers = new Map<string, CityTracker>();

  function makeEvent(
    type: WorldEvent['type'],
    title: string,
    cities: string[],
    intensity: number,
    duration: number,
  ): WorldEvent {
    eventCounter++;
    const evt: WorldEvent = {
      id: `evt-${eventCounter}`,
      type,
      title,
      cities,
      startedAt: Date.now(),
      duration,
      intensity: Math.min(1, intensity),
    };

    // Persist to DB asynchronously
    if (pool) {
      pool.query(
        `INSERT INTO event_history (event_id, type, title, cities, intensity, duration, started_at)
         VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0))`,
        [evt.id, evt.type, evt.title, evt.cities, evt.intensity, evt.duration, evt.startedAt],
      ).catch((err) => console.error('[event] persist error:', err));
    }

    return evt;
  }

  function check(snapshot: WorldSnapshot, currentStreak: number, bestStreak: number, territory?: TerritorySnapshot | null): WorldEvent | null {
    const now = Date.now();

    // Clear expired event
    if (currentEvent && now - currentEvent.startedAt > currentEvent.duration) {
      // Mark ended in DB
      if (pool && currentEvent) {
        pool.query(
          'UPDATE event_history SET ended_at = NOW() WHERE event_id = $1 AND ended_at IS NULL',
          [currentEvent.id],
        ).catch(() => {});
      }
      currentEvent = null;
    }

    // Don't create a new event if one is active
    if (currentEvent) return null;

    // Update city trackers
    for (const city of snapshot.cities) {
      let tracker = cityTrackers.get(city.city);
      if (!tracker) {
        tracker = { energy: 0, lastEnergy: 0, lastUpdate: now, wasZero: true, zeroSince: now };
        cityTrackers.set(city.city, tracker);
      }
      tracker.lastEnergy = tracker.energy;
      tracker.energy = city.energy;
      tracker.lastUpdate = now;

      if (city.energy < 1) {
        if (!tracker.wasZero) {
          tracker.wasZero = true;
          tracker.zeroSince = now;
        }
      } else {
        tracker.wasZero = false;
      }
    }

    // Check: record broken (energy)
    if (snapshot.totalEnergy > lastAllTimeEnergy * 1.5 && snapshot.totalEnergy > 500) {
      lastAllTimeEnergy = snapshot.totalEnergy;
      const evt = makeEvent('record_broken', `New energy record: ${Math.round(snapshot.totalEnergy)}`, [], 1.0, 15000);
      currentEvent = evt;
      return evt;
    }
    if (snapshot.totalEnergy > lastAllTimeEnergy) lastAllTimeEnergy = snapshot.totalEnergy;

    // Check: record broken (streak)
    if (bestStreak > lastAllTimeStreak && bestStreak > 5) {
      lastAllTimeStreak = bestStreak;
      const evt = makeEvent('record_broken', `New resonance record: ${bestStreak}`, [], 1.0, 15000);
      currentEvent = evt;
      return evt;
    }
    if (bestStreak > lastAllTimeStreak) lastAllTimeStreak = bestStreak;

    // Check: resonance wave (streak multiples of 10)
    if (currentStreak > 0 && currentStreak % 10 === 0) {
      const evt = makeEvent('resonance_wave', `Resonance wave x${currentStreak}`, [], Math.min(1, currentStreak / 50), 10000);
      currentEvent = evt;
      return evt;
    }

    // Check: territory war (2+ countries with similar high energy)
    if (territory && territory.topCountries.length >= 2) {
      const top = territory.topCountries.slice(0, 2);
      if (top[0].energy > 100 && top[1].energy > 100) {
        const ratio = top[1].energy / top[0].energy;
        if (ratio > 0.7) {
          const evt = makeEvent(
            'territory_war',
            `Territory clash: ${top[0].name} vs ${top[1].name}`,
            [],
            Math.min(1, (top[0].energy + top[1].energy) / 500),
            20000,
          );
          currentEvent = evt;
          return evt;
        }
      }
    }

    // Check: cascade (3+ cities with rising momentum)
    if (territory && territory.topCities.length >= 3) {
      const rising = territory.topCities.filter((c) => c.momentum > 0.5);
      if (rising.length >= 3) {
        const names = rising.slice(0, 3).map((c) => c.name);
        const evt = makeEvent(
          'cascade',
          `Energy cascade: ${names.join(' → ')}`,
          names,
          Math.min(1, rising.length / 5),
          18000,
        );
        currentEvent = evt;
        return evt;
      }
    }

    // Check: city surge (energy jumps 3x in recent period)
    for (const [cityName, tracker] of cityTrackers) {
      if (tracker.energy > 50 && tracker.lastEnergy > 0 && tracker.energy > tracker.lastEnergy * 3) {
        const evt = makeEvent('surge', `${cityName} surge`, [cityName], Math.min(1, tracker.energy / 200), 20000);
        currentEvent = evt;
        return evt;
      }
    }

    // Check: convergence (3+ cities above threshold)
    const activeCities = snapshot.cities.filter((c) => c.energy > 50);
    if (activeCities.length >= 3) {
      const names = activeCities.slice(0, 3).map((c) => c.city);
      const evt = makeEvent('convergence', `Convergence: ${names.join(', ')}`, names, Math.min(1, activeCities.length / 5), 25000);
      currentEvent = evt;
      return evt;
    }

    // Check: awakening wave (3+ cities wake up from zero within 2 minutes)
    const recentAwakenings: string[] = [];
    for (const [cityName, tracker] of cityTrackers) {
      if (!tracker.wasZero && tracker.energy > 20 && tracker.zeroSince > 0 && now - tracker.zeroSince < 120000) {
        recentAwakenings.push(cityName);
      }
    }
    if (recentAwakenings.length >= 3) {
      const evt = makeEvent(
        'awakening_wave',
        `Awakening wave: ${recentAwakenings.slice(0, 3).join(', ')}`,
        recentAwakenings.slice(0, 3),
        0.7,
        20000,
      );
      // Reset zeroSince to prevent re-trigger
      for (const name of recentAwakenings) {
        const t = cityTrackers.get(name);
        if (t) t.zeroSince = 0;
      }
      currentEvent = evt;
      return evt;
    }

    // Check: city awakening (was zero, now >50 within 60s)
    for (const [cityName, tracker] of cityTrackers) {
      if (!tracker.wasZero && tracker.energy > 50 && tracker.zeroSince > 0 && now - tracker.zeroSince < 60000) {
        tracker.zeroSince = 0; // prevent re-trigger
        const evt = makeEvent('city_awakening', `${cityName} awakens`, [cityName], 0.6, 15000);
        currentEvent = evt;
        return evt;
      }
    }

    // Check: quiet zone (all cities below threshold for 60s)
    const allQuiet = snapshot.totalEnergy < 10;
    if (allQuiet) {
      if (quietSince === 0) quietSince = now;
      if (now - quietSince > 60000) {
        quietSince = 0;
        const evt = makeEvent('quiet_zone', 'The field rests', [], 0.2, 30000);
        currentEvent = evt;
        return evt;
      }
    } else {
      quietSince = 0;
    }

    return null;
  }

  function getCurrentEvent(): WorldEvent | null {
    if (currentEvent && Date.now() - currentEvent.startedAt > currentEvent.duration) {
      currentEvent = null;
    }
    return currentEvent;
  }

  async function getRecentEvents(limit: number = 20): Promise<Array<{ id: string; type: string; title: string; startedAt: number }>> {
    if (!pool) return [];
    try {
      const { rows } = await pool.query(
        'SELECT event_id, type, title, started_at FROM event_history ORDER BY started_at DESC LIMIT $1',
        [limit],
      );
      return rows.map((r: { event_id: string; type: string; title: string; started_at: Date }) => ({
        id: r.event_id,
        type: r.type,
        title: r.title,
        startedAt: new Date(r.started_at).getTime(),
      }));
    } catch {
      return [];
    }
  }

  return { check, getCurrentEvent, getRecentEvents };
}
