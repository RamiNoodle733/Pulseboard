import { config } from './env.js';

interface RecentPulse {
  userId: string;
  t: number;
}

interface StreakResult {
  streakIncreased: boolean;
  streakBroken: boolean;
  contributors: number;
  syncedUserIds: string[];
}

export function createStreakManager() {
  const recentPulses: RecentPulse[] = [];
  const syncedGroupKeys = new Set<string>();
  let currentStreak = 0;
  let bestStreak = 0;
  let lastSyncTime = 0;

  function getDynamicThreshold(connectedUsers: number): number {
    const dynamic = Math.max(2, Math.floor(connectedUsers * 0.6));
    return Math.min(dynamic, config.syncRequiredUsers);
  }

  function pruneOld(now: number) {
    const cutoff = now - 5000;
    while (recentPulses.length > 0 && recentPulses[0].t < cutoff) {
      recentPulses.shift();
    }
    if (syncedGroupKeys.size > 100) {
      syncedGroupKeys.clear();
    }
  }

  function getDistinctUsersInWindow(now: number): string[] {
    const windowStart = now - config.syncWindowMs;
    const seen = new Set<string>();
    for (let i = recentPulses.length - 1; i >= 0; i--) {
      const p = recentPulses[i];
      if (p.t < windowStart) break;
      seen.add(p.userId);
    }
    return Array.from(seen);
  }

  function addPulse(userId: string, now: number, connectedUsers: number): StreakResult {
    pruneOld(now);
    recentPulses.push({ userId, t: now });

    const required = getDynamicThreshold(connectedUsers);

    // check inactivity break
    const broken = currentStreak > 0 && lastSyncTime > 0 && (now - lastSyncTime) > 3000;
    if (broken) {
      currentStreak = 0;
      syncedGroupKeys.clear();
    }

    const usersInWindow = getDistinctUsersInWindow(now);

    if (usersInWindow.length >= required) {
      const groupKey = usersInWindow.sort().join(',');
      if (!syncedGroupKeys.has(groupKey)) {
        syncedGroupKeys.add(groupKey);
        currentStreak += 1;
        bestStreak = Math.max(bestStreak, currentStreak);
        lastSyncTime = now;
        return {
          streakIncreased: true,
          streakBroken: broken,
          contributors: usersInWindow.length,
          syncedUserIds: usersInWindow,
        };
      }
    }

    return {
      streakIncreased: false,
      streakBroken: broken,
      contributors: usersInWindow.length,
      syncedUserIds: [],
    };
  }

  function checkInactivity(): boolean {
    if (currentStreak > 0 && lastSyncTime > 0 && (Date.now() - lastSyncTime) > 3000) {
      currentStreak = 0;
      syncedGroupKeys.clear();
      return true;
    }
    return false;
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
      requiredUsers: getDynamicThreshold(connectedUsers),
    };
  }

  return {
    addPulse,
    checkInactivity,
    getCurrentStreak,
    getBestStreak,
    getState,
  };
}
