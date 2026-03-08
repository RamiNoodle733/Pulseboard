import { RateLimiterMemory } from 'rate-limiter-flexible';
import { config } from './env.js';

const pulseLimiter = new RateLimiterMemory({
  points: config.pulseRatePoints,
  duration: config.pulseRateDuration,
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

export function checkColorChangeCooldown(lastChange: number): boolean {
  const cooldownMs = config.colorChangeCooldown * 1000;
  return Date.now() - lastChange >= cooldownMs;
}
