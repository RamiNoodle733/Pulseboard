# Pulseboard — Cloud Agent Starter Skill

## Quick Reference

| Item | Detail |
|------|--------|
| Stack | TypeScript monorepo (npm workspaces) |
| Client | React 18 + Vite 5 + Tailwind 3 + Zustand + Socket.IO client |
| Server | Node 18+ + Fastify 4 + Socket.IO 4 + PostgreSQL (optional) |
| Ports | Server `:3000`, Client `:5173` |
| Env file | Root `.env` (loaded via `--env-file=../../.env` in server scripts) |
| Test framework | None — all testing is manual |

---

## 1. Environment Setup

### Install dependencies

```bash
cd /workspace
npm install
```

### Create the root `.env` file

Copy the example and fill in minimal values. The server starts fine with
**zero** optional vars set — it falls back to in-memory mode with all
optional integrations disabled.

```bash
cp apps/server/.env.example .env
```

Minimal `.env` for local dev (everything works without DB or OAuth):

```env
PORT=3000
HOST=0.0.0.0
CLIENT_URL=http://localhost:5173
SYNC_REQUIRED_USERS=2
```

Setting `SYNC_REQUIRED_USERS=2` makes it easy to test sync/streak behavior
with just two browser tabs instead of the default 8.

### Environment variable tiers

| Tier | Variables | Effect when absent |
|------|-----------|--------------------|
| **Core** | `PORT`, `HOST`, `CLIENT_URL` | Uses defaults (3000, 0.0.0.0, localhost:5173) |
| **Database** | `DATABASE_URL` | Server runs in-memory; auth/XP/leaderboards disabled |
| **Auth** | `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `JWT_SECRET` | GitHub login disabled; anonymous-only mode |
| **AI** | `OPENAI_API_KEY`, `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO` | AI proposals and narrator disabled |
| **Payments** | `STRIPE_SECRET_KEY` | Paid prompts disabled |
| **Notifications** | `DISCORD_WEBHOOK_URL` | Discord notifications disabled |

All config is centralized in `apps/server/src/env.ts`. Every variable has a
sensible fallback so the app never crashes from missing env vars.

### Feature flags

There is **no feature-flag service** (no LaunchDarkly, Unleash, etc.).
Features are toggled implicitly by the presence of their related env vars:

- **AI features** → enabled when `OPENAI_API_KEY` **and** `GITHUB_TOKEN` are set
- **Narrator** → enabled when `OPENAI_API_KEY` is set
- **Auth routes** → registered when `DATABASE_URL` + `GITHUB_OAUTH_CLIENT_ID` + `GITHUB_OAUTH_CLIENT_SECRET` are all set
- **Stripe** → enabled when `STRIPE_SECRET_KEY` is set

To "toggle a feature on" for testing, set the relevant env vars in `.env`
and restart the server.

---

## 2. Running the App

### Start both client and server (recommended)

```bash
npm run dev
```

This uses `concurrently` to run:
- Server at `http://localhost:3000` (via `tsx watch`)
- Client at `http://localhost:5173` (via Vite)

### Start individually

```bash
npm run dev:server   # server only
npm run dev:client   # client only
```

### Production build

```bash
npm run build        # builds both workspaces
npm run start        # starts production server (serves API only)
```

### Health check

```bash
curl http://localhost:3000/health
# → {"status":"ok","timestamp":...}
```

### Status endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Basic liveness check |
| `GET /stats` | Live stats (pulses, syncs, users, streaks) |
| `GET /ai/status` | Whether AI + paid features are enabled |
| `GET /auth/status` | Whether DB, OAuth, and auth routes are configured |

---

## 3. Testing by Codebase Area

### 3a. Server Core (WebSocket + Sync)

**What to test:** Pulse sending, sync/streak mechanics, rate limiting,
user join/leave, color changes.

**Setup:**
1. Start the app: `npm run dev`
2. Open `http://localhost:5173` in two or more browser tabs

**Workflow:**
1. Verify `/health` returns `{"status":"ok"}`
2. Check server logs for `[pulseboard] server listening on 0.0.0.0:3000`
3. Open two tabs → each should show a unique user ordinal (User1, User2, etc.)
4. Send pulses in both tabs → verify they appear on both canvases
5. Pulse both tabs within the sync window → verify streak increments
   (set `SYNC_REQUIRED_USERS=2` to make this easy)
6. Wait for streak to break → verify streak resets
7. Check `GET /stats` for updated pulse/sync counts

**Key files:**
- `apps/server/src/ws.ts` — all WebSocket event handling
- `apps/server/src/streak.ts` — streak calculation logic
- `apps/server/src/rateLimit.ts` — rate limiting
- `apps/server/src/env.ts` — config and defaults

### 3b. Client UI (React + Canvas)

**What to test:** Color selection, pulse visualization, HUD elements,
feed, responsive layout.

**Setup:**
1. Start the app: `npm run dev`
2. Open `http://localhost:5173`

**Workflow:**
1. Verify the canvas renders and responds to clicks/taps
2. Change color → verify the color picker updates and the server
   acknowledges the change (watch server logs for `color-changed`)
3. Open the HUD panel → verify stats display
4. Check mobile viewport → verify responsive layout

**Key files:**
- `apps/client/src/App.tsx` — main app shell
- `apps/client/src/store.ts` — Zustand state (all client state lives here)
- `apps/client/src/socket.ts` — Socket.IO client, `VITE_SERVER_URL` config
- `apps/client/vite.config.ts` — dev server settings

### 3c. Database + Persistence

**What to test:** Migration execution, user persistence, proposals, XP,
leaderboards, achievements.

**Setup:**
1. Set `DATABASE_URL` in `.env` to a running PostgreSQL instance
2. Restart the server: `npm run dev:server`
3. Watch logs for `[pulseboard] database connected, applied N migration(s)`

**Workflow:**
1. Verify migrations run on startup (check server logs)
2. Connect from a client → verify a user row is created in `users` table
3. Reconnect with same device → verify the same user row is reused
4. Test that removing `DATABASE_URL` falls back to in-memory mode gracefully

**Key files:**
- `apps/server/src/db.ts` — pool creation, inline migrations
- `apps/server/src/db/stats.ts` — DB-backed stats
- `apps/server/src/db/proposals.ts` — DB-backed proposals
- `apps/server/src/xp.ts` — XP/leveling logic
- `apps/server/src/leaderboard.ts` — leaderboard queries
- `apps/server/src/achievements.ts` — achievement definitions and checks

### 3d. Authentication (GitHub OAuth)

**What to test:** OAuth flow, JWT issuance, authenticated WebSocket
connections, profile endpoints.

**Setup:**
1. Create a GitHub OAuth App at https://github.com/settings/developers
   - Callback URL: `http://localhost:3000/auth/github/callback`
2. Set in `.env`: `DATABASE_URL`, `GITHUB_OAUTH_CLIENT_ID`,
   `GITHUB_OAUTH_CLIENT_SECRET`, `JWT_SECRET`
3. Restart the server

**Workflow:**
1. `GET /auth/status` → verify `authRoutesAvailable: true`
2. Click the login button in the client → redirects to GitHub
3. After callback, verify `?token=...` appears in the client URL
4. Verify the token is stored in `localStorage` as `pulseboard:token`
5. Reconnect the WebSocket → verify `isAuthenticated: true` in `ws:joined`
6. `GET /auth/me` with `Authorization: Bearer <token>` → returns user info

**Mocking auth without GitHub:**
If you cannot set up a real OAuth app, the server still assigns anonymous
`device_id`-based users when `DATABASE_URL` is set. Auth-gated features
(profile, upgrades, leaderboard) require a real JWT though.

**Key files:**
- `apps/server/src/auth.ts` — OAuth routes, JWT helpers, device user logic
- `apps/client/src/App.tsx` — token extraction from URL
- `apps/client/src/socket.ts` — token sent in Socket.IO handshake
- `apps/client/src/components/AuthButton.tsx` — login button
- `apps/client/src/components/ProfilePanel.tsx` — profile display

### 3e. AI Features (Proposals + Narrator)

**What to test:** Prompt submission, AI-generated code proposals, PR
creation, narrator commentary.

**Setup:**
1. Set in `.env`: `OPENAI_API_KEY`, `GITHUB_TOKEN`, `GITHUB_OWNER`,
   `GITHUB_REPO`
2. Restart the server
3. `GET /ai/status` → verify `enabled: true`

**Workflow:**
1. Submit a prompt via the client UI → verify `ws:prompt-ack` event
2. Watch server logs for AI processing
3. Verify proposal appears in the proposals feed
4. If narrator is enabled, wait ~60s for narration events (`ws:narration`)

**Key files:**
- `apps/server/src/ai.ts` — OpenAI integration, change generation
- `apps/server/src/github.ts` — PR creation/merge/close
- `apps/server/src/proposals.ts` — proposal state machine (JSON fallback)
- `apps/server/src/narrator.ts` — periodic AI commentary
- `apps/server/src/modelRouter.ts` — token budget tracking

### 3f. Gamification (XP, Upgrades, Territory, Achievements)

**What to test:** XP gain, leveling, upgrade purchases, territory claims,
achievement unlocks, leaderboard rankings.

**Setup:** Requires `DATABASE_URL` and an authenticated user (see 3c and 3d).

**Workflow:**
1. Login and send pulses → verify `ws:xp-update` events
2. Emit `ws:get-profile` → verify XP and level data
3. Emit `ws:get-upgrades` → verify upgrade definitions load
4. Purchase an upgrade → verify `ws:upgrade-result` with `success: true`
5. Emit `ws:get-leaderboard` with `type: "xp"` → verify ranking
6. Emit `ws:get-achievements` → verify achievement list

**Key files:**
- `apps/server/src/xp.ts` — XP calculations and level thresholds
- `apps/server/src/upgrades.ts` — upgrade definitions and purchase logic
- `apps/server/src/territory.ts` — territory/world map state
- `apps/server/src/achievements.ts` — achievement tracking
- `apps/server/src/leaderboard.ts` — leaderboard queries

---

## 4. Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| Server crashes on start | Missing `node_modules` | Run `npm install` from repo root |
| Client can't connect to server | CORS mismatch | Ensure `CLIENT_URL` in `.env` matches the client origin |
| `.env` not loaded | Wrong file location | `.env` must be at repo root (not `apps/server/`) — scripts use `--env-file=../../.env` |
| Auth routes return 404 | Missing DB or OAuth config | Set `DATABASE_URL` + `GITHUB_OAUTH_*` vars; check `GET /auth/status` |
| Sync never triggers | `SYNC_REQUIRED_USERS` too high | Set `SYNC_REQUIRED_USERS=2` for local testing |
| Port conflict | Another process on 3000 or 5173 | Find PID with `lsof -i :3000` and kill by PID |
| TypeScript errors in client | Stale types | Run `npm run build` to catch compile errors |

---

## 5. Build Verification

```bash
# Full build check (both workspaces)
npm run build

# Server-only build
npm run build --workspace=apps/server

# Client-only build
npm run build --workspace=apps/client
```

TypeScript errors will surface during build. There is no linter or
formatter configured in this repo.

---

## 6. Updating This Skill

When you discover new testing tricks, environment workarounds, or runbook
knowledge while working on this codebase, update this file so future Cloud
agents benefit.

**What to add:**
- New env vars or config changes and their effects
- Workarounds for tricky local dev issues
- New testing workflows for new features
- Patterns for mocking or stubbing external services
- Database migration gotchas

**How to add it:**
1. Place new content in the appropriate section above (by codebase area)
2. If it doesn't fit an existing section, add a new `### 3x.` subsection
   under "Testing by Codebase Area"
3. If it's a common pitfall, add a row to the "Common Pitfalls" table
4. Keep entries concrete and actionable — include exact commands, env var
   names, file paths, and expected output
