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
