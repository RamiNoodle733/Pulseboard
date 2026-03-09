import type { WorldSnapshot } from './worldState.js';

export interface WorldEvent {
  id: string;
  type: 'surge' | 'convergence' | 'resonance_wave' | 'city_awakening' | 'quiet_zone' | 'record_broken';
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

export function createEventDirector() {
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
    return {
      id: `evt-${eventCounter}`,
      type,
      title,
      cities,
      startedAt: Date.now(),
      duration,
      intensity: Math.min(1, intensity),
    };
  }

  function check(snapshot: WorldSnapshot, currentStreak: number, bestStreak: number): WorldEvent | null {
    const now = Date.now();

    // Clear expired event
    if (currentEvent && now - currentEvent.startedAt > currentEvent.duration) {
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

  return { check, getCurrentEvent };
}
