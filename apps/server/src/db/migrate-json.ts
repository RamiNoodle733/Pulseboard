/**
 * One-time migration script: reads JSON files from ./data/ and inserts into PostgreSQL.
 * Run with: npx tsx apps/server/src/db/migrate-json.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { createPool, runMigrations } from '../db.js';
import { config } from '../env.js';

interface JsonStats {
  totalPulses: number;
  totalSyncs: number;
  bestStreakAllTime: number;
  cities: Record<string, { pulses: number; syncs: number }>;
}

interface JsonProposal {
  id: string;
  prompt: string;
  submittedByOrdinal: number;
  submittedAt: number;
  status: string;
  summary: string | null;
  reasoning: string | null;
  changedFiles: string[];
  prNumber: number | null;
  prUrl: string | null;
  branchName: string | null;
  resolvedAt: number | null;
  error: string | null;
  upvotes: string[];
  downvotes: string[];
}

interface JsonTokenUsage {
  date: string;
  premiumUsed: number;
  miniUsed: number;
}

async function main() {
  if (!config.databaseUrl) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const pool = createPool(config.databaseUrl);
  await runMigrations(pool);

  // --- Migrate stats ---
  const statsPath = './data/stats.json';
  if (existsSync(statsPath)) {
    console.log('[migrate] importing stats.json...');
    const stats: JsonStats = JSON.parse(readFileSync(statsPath, 'utf-8'));

    await pool.query(
      `UPDATE global_stats SET
        total_pulses = $1,
        total_syncs = $2,
        best_streak_all_time = $3,
        updated_at = NOW()
      WHERE id = 1`,
      [stats.totalPulses, stats.totalSyncs, stats.bestStreakAllTime],
    );

    for (const [city, data] of Object.entries(stats.cities)) {
      await pool.query(
        `INSERT INTO city_stats (city, pulses, syncs, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (city) DO UPDATE SET
           pulses = GREATEST(city_stats.pulses, EXCLUDED.pulses),
           syncs = GREATEST(city_stats.syncs, EXCLUDED.syncs),
           updated_at = NOW()`,
        [city, data.pulses, data.syncs],
      );
    }
    console.log(`[migrate] imported stats: ${stats.totalPulses} pulses, ${Object.keys(stats.cities).length} cities`);
  } else {
    console.log('[migrate] no stats.json found, skipping');
  }

  // --- Migrate proposals ---
  const proposalsPath = './data/proposals.json';
  if (existsSync(proposalsPath)) {
    console.log('[migrate] importing proposals.json...');
    const proposals: JsonProposal[] = JSON.parse(readFileSync(proposalsPath, 'utf-8'));

    let imported = 0;
    for (const p of proposals) {
      try {
        await pool.query(
          `INSERT INTO proposals (id, prompt, submitted_by_ordinal, submitted_at, status, summary, reasoning, changed_files, pr_number, pr_url, branch_name, resolved_at, error)
           VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), $5, $6, $7, $8, $9, $10, $11, ${p.resolvedAt ? 'to_timestamp($12 / 1000.0)' : 'NULL'}, ${p.resolvedAt ? '$13' : '$12'})
           ON CONFLICT (id) DO NOTHING`,
          p.resolvedAt
            ? [p.id, p.prompt, p.submittedByOrdinal, p.submittedAt, p.status, p.summary, p.reasoning, p.changedFiles, p.prNumber, p.prUrl, p.branchName, p.resolvedAt, p.error]
            : [p.id, p.prompt, p.submittedByOrdinal, p.submittedAt, p.status, p.summary, p.reasoning, p.changedFiles, p.prNumber, p.prUrl, p.branchName, p.error],
        );
        imported++;
      } catch (err) {
        console.warn(`[migrate] failed to import proposal ${p.id}:`, err);
      }
    }
    console.log(`[migrate] imported ${imported}/${proposals.length} proposals`);
  } else {
    console.log('[migrate] no proposals.json found, skipping');
  }

  // --- Migrate token usage ---
  const tokenPath = './data/tokenUsage.json';
  if (existsSync(tokenPath)) {
    console.log('[migrate] importing tokenUsage.json...');
    const usage: JsonTokenUsage = JSON.parse(readFileSync(tokenPath, 'utf-8'));

    await pool.query(
      `INSERT INTO token_usage (date, premium_used, mini_used)
       VALUES ($1, $2, $3)
       ON CONFLICT (date) DO UPDATE SET
         premium_used = GREATEST(token_usage.premium_used, EXCLUDED.premium_used),
         mini_used = GREATEST(token_usage.mini_used, EXCLUDED.mini_used)`,
      [usage.date, usage.premiumUsed, usage.miniUsed],
    );
    console.log(`[migrate] imported token usage for ${usage.date}`);
  } else {
    console.log('[migrate] no tokenUsage.json found, skipping');
  }

  await pool.end();
  console.log('[migrate] done!');
}

main().catch((err) => {
  console.error('[migrate] fatal error:', err);
  process.exit(1);
});
