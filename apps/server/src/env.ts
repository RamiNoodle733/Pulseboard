interface Config {
  port: number;
  host: string;
  clientUrls: string[];
  pulseRatePoints: number;
  pulseRateDuration: number;
  colorChangeCooldown: number;
  syncWindowMs: number;
  syncRequiredUsers: number;
  discordWebhookUrl: string | null;
  // AI feature
  openaiApiKey: string | null;
  openaiModel: string;
  githubToken: string | null;
  githubOwner: string | null;
  githubRepo: string | null;
  githubDefaultBranch: string;
  stripeSecretKey: string | null;
  stripePublishableKey: string | null;
  promptFreeLimit: number;
  promptFreeLimitWindowMs: number;
  promptRatePoints: number;
  promptRateDuration: number;
  proposalMaxActive: number;
  // Model routing budgets
  openaiDailyPremiumBudget: number;
  openaiDailyMiniBudget: number;
  // Narrator
  narratorEnabled: boolean;
  narratorIntervalMs: number;
  // Database
  databaseUrl: string | null;
  // GitHub OAuth
  githubOAuthClientId: string | null;
  githubOAuthClientSecret: string | null;
  jwtSecret: string;
  // Public URL of this server in production (e.g. https://server-production-d1bb.up.railway.app).
  // Used to build OAuth redirect_uri. Falls back to localhost for local dev.
  serverPublicUrl: string | null;
}

function num(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`[env] ${key}="${raw}" is not a valid number`);
  }
  return parsed;
}

function str(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const config: Readonly<Config> = Object.freeze({
  port: num('PORT', 3000),
  host: str('HOST', '0.0.0.0'),
  clientUrls: str('CLIENT_URL', 'http://localhost:5173')
    .split(',')
    .map((u) => u.trim().replace(/\/+$/, '')),
  pulseRatePoints: num('PULSE_RATE_POINTS', 5),
  pulseRateDuration: num('PULSE_RATE_DURATION', 3),
  colorChangeCooldown: num('COLOR_CHANGE_COOLDOWN', 300),
  syncWindowMs: num('SYNC_WINDOW_MS', 600),
  syncRequiredUsers: num('SYNC_REQUIRED_USERS', 2),
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || null,
  openaiApiKey: process.env.OPENAI_API_KEY || null,
  openaiModel: str('OPENAI_MODEL', 'gpt-4o'),
  githubToken: process.env.GITHUB_TOKEN || null,
  githubOwner: process.env.GITHUB_OWNER || null,
  githubRepo: process.env.GITHUB_REPO || null,
  githubDefaultBranch: str('GITHUB_DEFAULT_BRANCH', 'main'),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || null,
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
  promptFreeLimit: num('PROMPT_FREE_LIMIT', 1),
  promptFreeLimitWindowMs: num('PROMPT_FREE_LIMIT_WINDOW_MS', 86400000),
  promptRatePoints: num('PROMPT_RATE_POINTS', 3),
  promptRateDuration: num('PROMPT_RATE_DURATION', 60),
  proposalMaxActive: num('PROPOSAL_MAX_ACTIVE', 20),
  openaiDailyPremiumBudget: num('OPENAI_DAILY_PREMIUM_BUDGET', 250000),
  openaiDailyMiniBudget: num('OPENAI_DAILY_MINI_BUDGET', 2500000),
  narratorEnabled: !!(process.env.OPENAI_API_KEY),
  narratorIntervalMs: num('NARRATOR_INTERVAL_MS', 60000),
  databaseUrl: process.env.DATABASE_URL || null,
  githubOAuthClientId: process.env.GITHUB_OAUTH_CLIENT_ID || null,
  githubOAuthClientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET || null,
  jwtSecret: str('JWT_SECRET', 'pulseboard-dev-secret-change-me'),
  serverPublicUrl: process.env.SERVER_PUBLIC_URL || null,
});
