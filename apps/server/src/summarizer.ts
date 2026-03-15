import pg from 'pg';
import { routeRequest } from './modelRouter.js';
import type { WorldSnapshot } from './worldState.js';

export interface SummaryResult {
  text: string;
  period: string;
  generatedAt: number;
}

export interface SummarizerManager {
  generateHourlySummary(snapshot: WorldSnapshot, userCount: number): Promise<SummaryResult | null>;
  getRecentSummaries(limit?: number): Promise<SummaryResult[]>;
}

export function createSummarizer(pool: pg.Pool): SummarizerManager {
  let lastHourlySummary = 0;

  async function generateHourlySummary(
    snapshot: WorldSnapshot,
    userCount: number,
  ): Promise<SummaryResult | null> {
    const now = Date.now();
    // Only generate a summary every hour
    if (now - lastHourlySummary < 3600_000) return null;
    if (snapshot.totalEnergy < 1 && userCount === 0) return null;

    lastHourlySummary = now;

    const cityList = snapshot.cities
      .filter((c) => c.energy > 1)
      .slice(0, 5)
      .map((c) => `${c.city}: ${Math.round(c.energy)} energy`)
      .join(', ');

    const prompt = `Pulseboard hourly summary. ${userCount} users online. Total energy: ${Math.round(snapshot.totalEnergy)}. Phase: ${snapshot.phase.name}. Active cities: ${cityList || 'none'}. Hot zones: ${snapshot.hotZones.join(', ') || 'none'}.
Write a 2-3 sentence summary of what happened on Pulseboard this hour. Be atmospheric and engaging, not technical. Max 200 chars.`;

    try {
      const result = await routeRequest(
        'cheap',
        prompt,
        'You summarize activity on Pulseboard, a living global energy field. Write short, poetic summaries.',
      );
      const text = result.content.trim().replace(/^["']|["']$/g, '');

      // Persist to DB
      try {
        await pool.query(
          `INSERT INTO daily_summaries (period, summary, stats) VALUES ($1, $2, $3)`,
          [
            'hourly',
            text,
            JSON.stringify({
              userCount,
              totalEnergy: Math.round(snapshot.totalEnergy),
              phase: snapshot.phase.name,
              activeCities: snapshot.cities.length,
            }),
          ],
        );
      } catch {
        // Ignore persist errors (e.g., duplicate)
      }

      return { text, period: 'hourly', generatedAt: now };
    } catch (err) {
      console.warn('[summarizer] hourly summary failed:', err);
      return null;
    }
  }

  async function getRecentSummaries(limit: number = 10): Promise<SummaryResult[]> {
    try {
      const { rows } = await pool.query(
        'SELECT period, summary, generated_at FROM daily_summaries ORDER BY generated_at DESC LIMIT $1',
        [limit],
      );
      return rows.map((r: { period: string; summary: string; generated_at: Date }) => ({
        text: r.summary,
        period: r.period,
        generatedAt: new Date(r.generated_at).getTime(),
      }));
    } catch {
      return [];
    }
  }

  return { generateHourlySummary, getRecentSummaries };
}
