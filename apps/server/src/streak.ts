import { config } from './env.js';

interface StreakResult {
  streakIncreased: boolean;
  streakBroken: boolean;
  contributors: number;
}

interface WindowState {
  windowEnd: number;
  contributors: number;
  required: number;
}

export function createStreakManager() {
  let windowStart = Date.now();
  let windowEnd = windowStart + config.syncWindowMs;
  let contributors = new Set<string>();
  let currentStreak = 0;
  let bestStreak = 0;

  function getDynamicThreshold(connectedUsers: number): number {
    const dynamic = Math.max(2, Math.floor(connectedUsers * 0.6));
    return Math.min(dynamic, config.syncRequiredUsers);
  }

  function addPulse(userId: string, now: number, connectedUsers: number): StreakResult {
    const required = getDynamicThreshold(connectedUsers);
    const windowExpired = now > windowEnd;

    if (windowExpired) {
      // evaluate the completed window BEFORE rolling
      const hadEnough = contributors.size >= required;
      const hadStreak = currentStreak > 0;

      if (hadEnough) {
        currentStreak += 1;
        bestStreak = Math.max(bestStreak, currentStreak);
      } else if (hadStreak) {
        currentStreak = 0;
      }

      // roll to new window
      windowStart = now;
      windowEnd = now + config.syncWindowMs;
      contributors = new Set();
      contributors.add(userId);

      return {
        streakIncreased: hadEnough,
        streakBroken: !hadEnough && hadStreak,
        contributors: contributors.size,
      };
    }

    // window still active -- add contributor
    contributors.add(userId);

    // check if sync threshold just reached within this window
    if (contributors.size === required) {
      currentStreak += 1;
      bestStreak = Math.max(bestStreak, currentStreak);

      // roll to fresh window immediately so the next batch starts clean
      windowStart = now;
      windowEnd = now + config.syncWindowMs;
      contributors = new Set();

      return {
        streakIncreased: true,
        streakBroken: false,
        contributors: required,
      };
    }

    return {
      streakIncreased: false,
      streakBroken: false,
      contributors: contributors.size,
    };
  }

  function getWindowState(connectedUsers: number): WindowState {
    return {
      windowEnd,
      contributors: contributors.size,
      required: getDynamicThreshold(connectedUsers),
    };
  }

  function getCurrentStreak(): number {
    return currentStreak;
  }

  function getBestStreak(): number {
    return bestStreak;
  }

  function getState(connectedUsers: number) {
    return {
      currentStreak,
      bestStreak,
      windowEnd,
      contributors: contributors.size,
      requiredUsers: getDynamicThreshold(connectedUsers),
    };
  }

  return {
    addPulse,
    getState,
    getWindowState,
    getCurrentStreak,
    getBestStreak,
  };
}
