import { RateLimiterMemory } from 'rate-limiter-flexible';
import { config } from './env.js';

const pulseLimiter = new RateLimiterMemory({
  points: config.pulseRatePoints,
  duration: config.pulseRateDuration,
  blockDuration: 0,
});

const promptLimiter = new RateLimiterMemory({
  points: config.promptRatePoints,
  duration: config.promptRateDuration,
  blockDuration: 0,
});

export async function checkPulseLimit(userId: string): Promise<boolean> {
  try {
    await pulseLimiter.consume(userId, 1);
    return true;
  } catch (_err: unknown) {
    return false;
  }
}

export async function checkPromptRateLimit(userId: string): Promise<boolean> {
  try {
    await promptLimiter.consume(userId, 1);
    return true;
  } catch (_err: unknown) {
    return false;
  }
}

export function checkColorChangeCooldown(lastChange: number): boolean {
  const cooldownMs = config.colorChangeCooldown * 1000;
  return Date.now() - lastChange >= cooldownMs;
}

// Free tier prompt tracking per IP
const freePromptUsage = new Map<string, { count: number; windowStart: number }>();

export function checkFreePromptLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const usage = freePromptUsage.get(ip);

  if (!usage || (now - usage.windowStart) > config.promptFreeLimitWindowMs) {
    freePromptUsage.set(ip, { count: 0, windowStart: now });
    return { allowed: true, remaining: config.promptFreeLimit };
  }

  if (usage.count >= config.promptFreeLimit) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: config.promptFreeLimit - usage.count };
}

export function consumeFreePrompt(ip: string): void {
  const usage = freePromptUsage.get(ip);
  if (usage) usage.count++;
}

export function getFreePromptsRemaining(ip: string): number {
  const now = Date.now();
  const usage = freePromptUsage.get(ip);
  if (!usage || (now - usage.windowStart) > config.promptFreeLimitWindowMs) {
    return config.promptFreeLimit;
  }
  return Math.max(0, config.promptFreeLimit - usage.count);
}
