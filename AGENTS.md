# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Pulseboard is a real-time anonymous color-pulse synchronization platform. It is an npm workspace monorepo with two packages under `apps/`: `server` (Fastify + Socket.IO) and `client` (React + Vite + Tailwind). See `SETUP.md` for full setup docs.

### Running in development

```bash
npm run dev          # starts both server (:3000) and client (:5173) via concurrently
npm run dev:server   # server only
npm run dev:client   # client only
```

### Key caveats

- **No ESLint / lint script**: There is no `lint` script or ESLint config. TypeScript compilation (`npm run build`) is the primary static check.
- **No test framework**: There are no automated tests configured in any workspace package.
- **`.env` location**: The server loads environment variables from `../../.env` relative to `apps/server/` (i.e., the workspace root `.env`). Create `/workspace/.env` for local dev, **not** `apps/server/.env`.
- **In-memory mode**: The server runs without a database when `DATABASE_URL` is not set. Auth, XP, leaderboards, and persistence features are disabled but the core pulse/sync loop works fully.
- **SYNC_REQUIRED_USERS**: Defaults to `2` in `.env.example`. Set this low for local testing so sync events can be triggered with fewer browser tabs.
- **Optional services**: PostgreSQL, GitHub OAuth, OpenAI, Stripe, and Discord are all optional. The server gracefully degrades when their env vars are absent.
