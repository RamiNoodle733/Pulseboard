import pg from 'pg';

export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')
      ? undefined
      : { rejectUnauthorized: false },
  });
}

/**
 * Migrations are inlined in TypeScript so they ship inside the compiled JS
 * bundle and work in any environment (Railway, Docker, etc.) without needing
 * to copy .sql files into dist/.
 */
const MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: '001_initial.sql',
    sql: `
-- Users (anonymous via device_id, optionally linked to GitHub)
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  github_id     BIGINT UNIQUE,
  username      VARCHAR(255),
  display_name  VARCHAR(255),
  avatar_url    TEXT,
  device_id     VARCHAR(64) UNIQUE NOT NULL,
  color         VARCHAR(7) DEFAULT '#FF6B6B',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_device_id ON users(device_id);

-- Proposals (replaces ./data/proposals.json)
CREATE TABLE IF NOT EXISTS proposals (
  id                   VARCHAR(21) PRIMARY KEY,
  prompt               TEXT NOT NULL,
  submitted_by         INTEGER REFERENCES users(id),
  submitted_by_ordinal INTEGER NOT NULL DEFAULT 0,
  submitted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status               VARCHAR(20) NOT NULL DEFAULT 'submitted',
  summary              TEXT,
  reasoning            TEXT,
  changed_files        TEXT[] DEFAULT '{}',
  pr_number            INTEGER,
  pr_url               TEXT,
  branch_name          VARCHAR(255),
  resolved_at          TIMESTAMPTZ,
  error                TEXT
);

CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_submitted_at ON proposals(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_search ON proposals
  USING GIN (to_tsvector('english', coalesce(prompt,'') || ' ' || coalesce(summary,'')));

-- Votes (one vote per user per proposal)
CREATE TABLE IF NOT EXISTS votes (
  id          SERIAL PRIMARY KEY,
  proposal_id VARCHAR(21) NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  direction   VARCHAR(4) NOT NULL CHECK (direction IN ('up', 'down')),
  voted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (proposal_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_votes_proposal ON votes(proposal_id);

-- Global stats (singleton row)
CREATE TABLE IF NOT EXISTS global_stats (
  id                    INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total_pulses          BIGINT NOT NULL DEFAULT 0,
  total_syncs           BIGINT NOT NULL DEFAULT 0,
  best_streak_all_time  INTEGER NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO global_stats (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Per-city stats
CREATE TABLE IF NOT EXISTS city_stats (
  city        VARCHAR(255) PRIMARY KEY,
  pulses      BIGINT NOT NULL DEFAULT 0,
  syncs       BIGINT NOT NULL DEFAULT 0,
  lat         DOUBLE PRECISION DEFAULT 0,
  lon         DOUBLE PRECISION DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily token usage for model router
CREATE TABLE IF NOT EXISTS token_usage (
  date            DATE PRIMARY KEY DEFAULT CURRENT_DATE,
  premium_used    BIGINT NOT NULL DEFAULT 0,
  mini_used       BIGINT NOT NULL DEFAULT 0
);
`,
  },
  {
    name: '002_gamification.sql',
    sql: `
-- XP tracking per user
CREATE TABLE IF NOT EXISTS user_xp (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  xp            BIGINT NOT NULL DEFAULT 0,
  total_xp      BIGINT NOT NULL DEFAULT 0,
  level         INTEGER NOT NULL DEFAULT 1,
  daily_xp      BIGINT NOT NULL DEFAULT 0,
  daily_xp_date DATE NOT NULL DEFAULT CURRENT_DATE,
  last_xp_at    TIMESTAMPTZ,
  login_streak  INTEGER NOT NULL DEFAULT 0,
  last_login_date DATE
);

-- Available upgrades (seed data inserted below)
CREATE TABLE IF NOT EXISTS upgrades (
  id              SERIAL PRIMARY KEY,
  slug            VARCHAR(64) UNIQUE NOT NULL,
  name            VARCHAR(128) NOT NULL,
  description     TEXT NOT NULL,
  category        VARCHAR(20) NOT NULL CHECK (category IN ('power', 'cosmetic', 'territory')),
  max_level       INTEGER NOT NULL DEFAULT 5,
  base_cost       INTEGER NOT NULL DEFAULT 100,
  cost_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.5,
  effect_type     VARCHAR(64) NOT NULL,
  effect_value    NUMERIC(8,4) NOT NULL DEFAULT 0.1
);

-- User-owned upgrades
CREATE TABLE IF NOT EXISTS user_upgrades (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  upgrade_id  INTEGER NOT NULL REFERENCES upgrades(id) ON DELETE CASCADE,
  level       INTEGER NOT NULL DEFAULT 1,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, upgrade_id)
);

-- Leaderboard cache (materialized, refreshed periodically)
CREATE TABLE IF NOT EXISTS leaderboard_cache (
  id          SERIAL PRIMARY KEY,
  board_type  VARCHAR(32) NOT NULL,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank        INTEGER NOT NULL,
  score       BIGINT NOT NULL DEFAULT 0,
  extra       JSONB DEFAULT '{}',
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_type_rank ON leaderboard_cache(board_type, rank);
CREATE INDEX IF NOT EXISTS idx_user_xp_level ON user_xp(level DESC, total_xp DESC);
CREATE INDEX IF NOT EXISTS idx_user_upgrades_user ON user_upgrades(user_id);

-- Seed upgrade definitions
INSERT INTO upgrades (slug, name, description, category, max_level, base_cost, cost_multiplier, effect_type, effect_value) VALUES
  ('pulse_rate',      'Pulse Frequency',    'Increases automatic pulse generation rate',           'power',     5, 100,  1.6, 'pulse_rate_mult',    0.15),
  ('energy_output',   'Energy Amplifier',   'Multiplies energy output per pulse',                  'power',     5, 150,  1.7, 'energy_mult',        0.20),
  ('influence_radius','Influence Expander', 'Increases your influence radius on the map',          'power',     5, 200,  1.8, 'influence_radius',   0.15),
  ('trail_sparkle',   'Sparkle Trail',      'Adds sparkle particles to your pulse trail',          'cosmetic',  3, 250,  2.0, 'trail_style',        1),
  ('trail_comet',     'Comet Trail',        'Leaves a comet-like trail behind your pulses',        'cosmetic',  3, 300,  2.0, 'trail_style',        2),
  ('trail_rings',     'Ripple Rings',       'Expanding ring effect on your pulses',                'cosmetic',  3, 200,  2.0, 'trail_style',        3),
  ('custom_colors',   'Color Palette',      'Unlocks additional pulse color options',              'cosmetic',  3, 150,  1.5, 'extra_colors',       4),
  ('particle_style',  'Particle Flair',     'Changes your particle emission pattern',              'cosmetic',  3, 200,  1.8, 'particle_style',     1),
  ('profile_badge',   'Profile Badge',      'Displays a badge on your profile and in the HUD',    'cosmetic',  5, 100,  1.4, 'badge_tier',         1),
  ('city_mult',       'City Booster',       'Multiplies your energy contribution to your city',    'territory', 5, 200,  1.6, 'city_energy_mult',   0.20),
  ('diffusion_range', 'Diffusion Reach',    'Increases how far your city''s energy spreads',       'territory', 3, 350,  2.0, 'diffusion_range',    0.25),
  ('territory_claim', 'Territory Claimer',  'Bonus energy when you are the top contributor',       'territory', 3, 400,  2.0, 'territory_claim',    0.15)
ON CONFLICT (slug) DO NOTHING;
`,
  },
];

export async function runMigrations(pool: pg.Pool): Promise<number> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows: applied } = await pool.query('SELECT name FROM _migrations');
  const appliedSet = new Set(applied.map((r: { name: string }) => r.name));

  let count = 0;
  for (const migration of MIGRATIONS) {
    if (appliedSet.has(migration.name)) continue;
    console.log(`[db] applying migration: ${migration.name}`);
    await pool.query(migration.sql);
    await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [migration.name]);
    console.log(`[db] applied migration: ${migration.name}`);
    count++;
  }

  return count;
}
