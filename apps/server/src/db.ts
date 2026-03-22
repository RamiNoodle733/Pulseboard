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
  {
    name: '003_territories.sql',
    sql: `
-- Territory hierarchy: world → country → state → city
CREATE TABLE IF NOT EXISTS territories (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  type            VARCHAR(20) NOT NULL CHECK (type IN ('world', 'country', 'state', 'city')),
  parent_id       INTEGER REFERENCES territories(id) ON DELETE SET NULL,
  lat             DOUBLE PRECISION DEFAULT 0,
  lon             DOUBLE PRECISION DEFAULT 0,
  current_energy  DOUBLE PRECISION NOT NULL DEFAULT 0,
  momentum        DOUBLE PRECISION NOT NULL DEFAULT 0,
  daily_energy    DOUBLE PRECISION NOT NULL DEFAULT 0,
  all_time_energy DOUBLE PRECISION NOT NULL DEFAULT 0,
  active_users    INTEGER NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, type)
);

CREATE INDEX IF NOT EXISTS idx_territories_type ON territories(type);
CREATE INDEX IF NOT EXISTS idx_territories_parent ON territories(parent_id);
CREATE INDEX IF NOT EXISTS idx_territories_energy ON territories(current_energy DESC);

-- Presence sessions for tracking continuous engagement
CREATE TABLE IF NOT EXISTS presence_sessions (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ,
  city        VARCHAR(255),
  total_energy DOUBLE PRECISION NOT NULL DEFAULT 0,
  xp_awarded  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_presence_sessions_user ON presence_sessions(user_id, started_at DESC);

-- Add city/lat/lon to users if not present
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(255);
  ALTER TABLE users ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Seed the root "World" territory
INSERT INTO territories (name, type) VALUES ('World', 'world') ON CONFLICT (name, type) DO NOTHING;
`,
  },
  {
    name: '004_events_achievements.sql',
    sql: `
-- Event history: persist world events
CREATE TABLE IF NOT EXISTS event_history (
  id          SERIAL PRIMARY KEY,
  event_id    VARCHAR(50) NOT NULL,
  type        VARCHAR(50) NOT NULL,
  title       VARCHAR(255) NOT NULL,
  cities      TEXT[] DEFAULT '{}',
  intensity   DOUBLE PRECISION NOT NULL DEFAULT 0,
  duration    INTEGER NOT NULL DEFAULT 0,
  started_at  TIMESTAMPTZ NOT NULL,
  ended_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_history_type ON event_history(type);
CREATE INDEX IF NOT EXISTS idx_event_history_started ON event_history(started_at DESC);

-- Daily summaries: AI-generated daily recaps
CREATE TABLE IF NOT EXISTS daily_summaries (
  id          SERIAL PRIMARY KEY,
  period      VARCHAR(20) NOT NULL DEFAULT 'daily',
  summary     TEXT NOT NULL,
  stats       JSONB DEFAULT '{}',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_summaries_period_date
  ON daily_summaries (period, (generated_at::date));

-- Achievement definitions (seeded below)
CREATE TABLE IF NOT EXISTS achievements (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR(50) NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  description VARCHAR(255) NOT NULL,
  icon        VARCHAR(10) NOT NULL DEFAULT '',
  xp_reward   INTEGER NOT NULL DEFAULT 0,
  category    VARCHAR(30) NOT NULL DEFAULT 'general',
  threshold   INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User achievements: earned achievements per user
CREATE TABLE IF NOT EXISTS user_achievements (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id  INTEGER NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);

-- Seed 10 achievements
INSERT INTO achievements (slug, name, description, icon, xp_reward, category, threshold) VALUES
  ('first_pulse',    'First Pulse',       'Send your first pulse into the field',   '1',  10,   'milestone',  1),
  ('first_sync',     'First Resonance',   'Participate in your first sync',         '2',  25,   'milestone',  1),
  ('level_5',        'Rising Star',       'Reach level 5',                          '3',  50,   'milestone',  5),
  ('level_10',       'Veteran',           'Reach level 10',                         '4',  100,  'milestone',  10),
  ('streak_10',      'Streak Master',     'Achieve a 10x resonance streak',         '5',  75,   'streak',     10),
  ('streak_25',      'Chain Lightning',   'Achieve a 25x resonance streak',         '6',  200,  'streak',     25),
  ('cities_5',       'Globe Trotter',     'Contribute energy in 5 different cities', '7', 50,   'exploration', 5),
  ('energy_1000',    'Power Plant',       'Contribute 1000 total energy',           '8',  100,  'energy',     1000),
  ('energy_10000',   'Supernova',         'Contribute 10000 total energy',          '9',  500,  'energy',     10000),
  ('login_7',        'Dedicated',         'Log in 7 days in a row',                '10',  150,  'loyalty',    7)
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
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migration.sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [migration.name]);
      await client.query('COMMIT');
      console.log(`[db] applied migration: ${migration.name}`);
      count++;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  return count;
}
