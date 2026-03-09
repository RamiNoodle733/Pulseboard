import { routeRequest } from './modelRouter.js';
import type { WorldSnapshot } from './worldState.js';
import type { WorldEvent } from './eventDirector.js';

export interface NarrationResult {
  text: string;
  t: number;
}

export interface InsightResult {
  text: string;
  t: number;
}

export function createNarrator() {
  let lastNarrationTime = 0;
  let lastInsightTime = 0;

  async function generateNarration(
    snapshot: WorldSnapshot,
    userCount: number,
    currentEvent: WorldEvent | null,
  ): Promise<NarrationResult | null> {
    const now = Date.now();
    if (now - lastNarrationTime < 60_000) return null;
    if (snapshot.totalEnergy < 1 && userCount === 0) return null;

    lastNarrationTime = now;

    const eventLine = currentEvent ? `Recent event: ${currentEvent.title}.` : '';
    const cityLine = snapshot.hotZones.length > 0
      ? `Hot zones: ${snapshot.hotZones.join(', ')}.`
      : 'No dominant zones.';

    const prompt = `World state: ${Math.round(snapshot.totalEnergy)} total energy, ${snapshot.phase.name} phase, ${userCount} users connected. ${cityLine} ${eventLine}
In one line (max 120 chars), narrate what's happening on Pulseboard. Be atmospheric and evocative, not technical. No quotes.`;

    try {
      const result = await routeRequest('cheap', prompt, 'You are a poetic narrator for a living global energy field called Pulseboard. Write short, atmospheric observations.');
      const text = result.content.trim().replace(/^["']|["']$/g, '');
      return { text, t: now };
    } catch (err) {
      console.warn('[narrator] narration failed:', err);
      return null;
    }
  }

  async function generateInsight(
    snapshot: WorldSnapshot,
    totalEnergyEver: number,
  ): Promise<InsightResult | null> {
    const now = Date.now();
    if (now - lastInsightTime < 300_000) return null;
    if (snapshot.cities.length === 0) return null;

    lastInsightTime = now;

    const topCity = snapshot.cities[0];
    const cityShare = snapshot.totalEnergy > 0
      ? Math.round((topCity.energy / snapshot.totalEnergy) * 100)
      : 0;

    const prompt = `Stats: ${snapshot.cities.length} active cities. Top city: ${topCity.city} (${cityShare}% of current energy). Total energy ever: ${Math.round(totalEnergyEver)}. Rising cities: ${snapshot.risingCities.join(', ') || 'none'}.
Write one short insight (max 80 chars) about contributor patterns. Be factual and concise.`;

    try {
      const result = await routeRequest('cheap', prompt, 'You write short data insights for a live collaborative site. Be concise and factual.');
      return { text: result.content.trim(), t: now };
    } catch (err) {
      console.warn('[narrator] insight failed:', err);
      return null;
    }
  }

  return { generateNarration, generateInsight };
}
