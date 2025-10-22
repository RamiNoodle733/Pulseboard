import { RateLimiterMemory } from 'rate-limiter-flexible';

const PULSE_RATE_POINTS = Number(process.env.PULSE_RATE_POINTS) || 5;
const PULSE_RATE_DURATION = Number(process.env.PULSE_RATE_DURATION) || 3;

// Rate limiter for pulses: 5 pulses per 3 seconds
export const pulseLimiter = new RateLimiterMemory({
  points: PULSE_RATE_POINTS,
  duration: PULSE_RATE_DURATION,
  blockDuration: 0, // Don't block, just reject
});

export async function checkPulseLimit(userId: string): Promise<boolean> {
  try {
    await pulseLimiter.consume(userId, 1);
    return true;
  } catch (err) {
    return false;
  }
}

export function checkColorChangeCooldown(lastChange: number): boolean {
  const COOLDOWN_MS = (Number(process.env.COLOR_CHANGE_COOLDOWN) || 300) * 1000; // 5 minutes default
  const now = Date.now();
  return now - lastChange >= COOLDOWN_MS;
}
