import { StreakState } from './types.js';

const WINDOW_MS = Number(process.env.SYNC_WINDOW_MS) || 600;
const REQUIRED_USERS = Number(process.env.SYNC_REQUIRED_USERS) || 8;

export function createStreakManager() {
  const state: StreakState = {
    windowStart: Date.now(),
    windowEnd: Date.now() + WINDOW_MS,
    contributors: new Set(),
    currentStreak: 0,
    bestStreak: 0,
    todayBestStreak: 0,
  };

  function rollWindow(now: number) {
    if (now > state.windowEnd) {
      state.windowStart = now;
      state.windowEnd = now + WINDOW_MS;
      state.contributors = new Set();
    }
  }

  function addPulse(userId: string, now: number): { 
    success: boolean; 
    streakIncreased: boolean;
    streakBroken: boolean;
    contributors: number;
  } {
    rollWindow(now);
    
    // Check if we're still in the current window
    if (now <= state.windowEnd) {
      state.contributors.add(userId);
      return { success: true, streakIncreased: false, streakBroken: false, contributors: state.contributors.size };
    }

    // Window has passed, check if we had enough contributors
    const hadEnough = state.contributors.size >= REQUIRED_USERS;
    const previousStreak = state.currentStreak;

    if (hadEnough) {
      state.currentStreak += 1;
      state.bestStreak = Math.max(state.bestStreak, state.currentStreak);
      state.todayBestStreak = Math.max(state.todayBestStreak, state.currentStreak);
    } else if (state.currentStreak > 0) {
      // Streak was active but broke
      state.currentStreak = 0;
      rollWindow(now);
      state.contributors.add(userId);
      return { 
        success: true, 
        streakIncreased: false, 
        streakBroken: true,
        contributors: state.contributors.size 
      };
    }

    // Roll to new window and add this pulse
    rollWindow(now);
    state.contributors.add(userId);

    return { 
      success: true, 
      streakIncreased: hadEnough, 
      streakBroken: false,
      contributors: state.contributors.size 
    };
  }

  function getState() {
    return {
      currentStreak: state.currentStreak,
      bestStreak: state.bestStreak,
      todayBestStreak: state.todayBestStreak,
      windowEnd: state.windowEnd,
      contributors: state.contributors.size,
      requiredUsers: REQUIRED_USERS,
    };
  }

  function getCurrentStreak() {
    return state.currentStreak;
  }

  function getBestStreak() {
    return state.bestStreak;
  }

  return {
    addPulse,
    getState,
    getCurrentStreak,
    getBestStreak,
  };
}
