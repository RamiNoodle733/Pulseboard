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
    .map((u) => u.trim()),
  pulseRatePoints: num('PULSE_RATE_POINTS', 5),
  pulseRateDuration: num('PULSE_RATE_DURATION', 3),
  colorChangeCooldown: num('COLOR_CHANGE_COOLDOWN', 300),
  syncWindowMs: num('SYNC_WINDOW_MS', 600),
  syncRequiredUsers: num('SYNC_REQUIRED_USERS', 2),
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || null,
});
