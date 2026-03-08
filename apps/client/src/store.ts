import { create } from 'zustand';
import type { FeedEntry } from './socket';

export interface Pulse {
  id: string;
  userId: string;
  color: string;
  x: number;
  y: number;
  t: number;
  ordinal: number;
  region: string;
}

export interface SyncEvent {
  t: number;
  userIds: string[];
  countries: string[];
  cities: string[];
  streak: number;
}

interface Store {
  // Connection & identity
  joined: boolean;
  myColor: string;
  myOrdinal: number | null;
  myUserId: string | null;
  myRegion: string;
  connected: boolean;

  // Streaks
  currentStreak: number;
  bestStreak: number;
  syncRequired: number;

  // Live data
  userCount: number;
  pulses: Pulse[];
  feedEntries: FeedEntry[];
  lastSync: SyncEvent | null;
  error: string | null;
  showingBurst: boolean;

  // Audio
  soundEnabled: boolean;

  // Activity level (0-1, drives background effects)
  activityLevel: number;

  // Session stats
  sessionStartTime: number;
  totalPulsesSent: number;
  totalPulsesReceived: number;
  syncsParticipatedIn: number;
  personalBestStreak: number;

  // City leaderboard
  citySyncCounts: Record<string, number>;

  // Overlay state
  showStats: boolean;
  showShareCard: boolean;
  lastShareableSync: SyncEvent | null;

  // Actions
  setJoined: (ordinal: number, color: string, streak: number, bestStreak: number) => void;
  setConnected: (connected: boolean) => void;
  setUserCount: (count: number) => void;
  addPulse: (pulse: Pulse) => void;
  updateStreak: (streak: number, bestStreak?: number) => void;
  triggerBurst: (sync: SyncEvent) => void;
  setError: (error: string | null) => void;
  clearOldPulses: () => void;
  setSyncRequired: (required: number) => void;
  setMyColor: (color: string) => void;
  addFeedEntry: (entry: FeedEntry) => void;
  toggleSound: () => void;

  // New actions
  setMyUserId: (userId: string) => void;
  setMyRegion: (region: string) => void;
  incrementPulsesSent: () => void;
  incrementPulsesReceived: () => void;
  incrementSyncs: () => void;
  updateActivityLevel: (delta: number) => void;
  decayActivityLevel: () => void;
  setShowStats: (show: boolean) => void;
  setShowShareCard: (show: boolean) => void;
  setLastShareableSync: (sync: SyncEvent) => void;
  updateCitySyncCounts: (cities: string[]) => void;
}

const MAX_FEED = 30;

export const useStore = create<Store>((set) => ({
  joined: false,
  myColor: '#FF6B6B',
  myOrdinal: null,
  myUserId: null,
  myRegion: '',
  connected: false,

  currentStreak: 0,
  bestStreak: 0,
  syncRequired: 2,

  userCount: 0,
  pulses: [],
  feedEntries: [],
  lastSync: null,
  error: null,
  showingBurst: false,

  soundEnabled: localStorage.getItem('pulseboard:sound') === 'true',

  activityLevel: 0,

  sessionStartTime: 0,
  totalPulsesSent: 0,
  totalPulsesReceived: 0,
  syncsParticipatedIn: 0,
  personalBestStreak: 0,

  citySyncCounts: {},

  showStats: false,
  showShareCard: false,
  lastShareableSync: null,

  setJoined: (ordinal, color, streak, bestStreak) =>
    set({ joined: true, myOrdinal: ordinal, myColor: color, currentStreak: streak, bestStreak, sessionStartTime: Date.now() }),

  setConnected: (connected) => set({ connected }),

  setUserCount: (count) => set({ userCount: count }),

  addPulse: (pulse) =>
    set((state) => ({ pulses: [...state.pulses, pulse] })),

  updateStreak: (streak, bestStreak) =>
    set((state) => ({
      currentStreak: streak,
      bestStreak: bestStreak !== undefined ? bestStreak : state.bestStreak,
      personalBestStreak: Math.max(state.personalBestStreak, streak),
    })),

  triggerBurst: (sync) => {
    set({ showingBurst: true, lastSync: sync });
    setTimeout(() => set({ showingBurst: false }), 2000);
  },

  setError: (error) => {
    set({ error });
    if (error) {
      setTimeout(() => set({ error: null }), 3000);
    }
  },

  clearOldPulses: () =>
    set((state) => ({
      pulses: state.pulses.filter((p) => Date.now() - p.t < 4000),
    })),

  setSyncRequired: (required) => set({ syncRequired: required }),

  setMyColor: (color) => set({ myColor: color }),

  addFeedEntry: (entry) =>
    set((state) => ({
      feedEntries: [entry, ...state.feedEntries].slice(0, MAX_FEED),
    })),

  toggleSound: () =>
    set((state) => {
      const next = !state.soundEnabled;
      localStorage.setItem('pulseboard:sound', String(next));
      return { soundEnabled: next };
    }),

  // New actions
  setMyUserId: (userId) => set({ myUserId: userId }),

  setMyRegion: (region) => set({ myRegion: region }),

  incrementPulsesSent: () =>
    set((state) => ({ totalPulsesSent: state.totalPulsesSent + 1 })),

  incrementPulsesReceived: () =>
    set((state) => ({ totalPulsesReceived: state.totalPulsesReceived + 1 })),

  incrementSyncs: () =>
    set((state) => ({ syncsParticipatedIn: state.syncsParticipatedIn + 1 })),

  updateActivityLevel: (delta) =>
    set((state) => ({ activityLevel: Math.min(1, state.activityLevel + delta) })),

  decayActivityLevel: () =>
    set((state) => ({ activityLevel: state.activityLevel * 0.95 })),

  setShowStats: (show) => set({ showStats: show }),

  setShowShareCard: (show) => set({ showShareCard: show }),

  setLastShareableSync: (sync) => set({ lastShareableSync: sync }),

  updateCitySyncCounts: (cities) =>
    set((state) => {
      const counts = { ...state.citySyncCounts };
      for (const city of cities) {
        if (city) counts[city] = (counts[city] || 0) + 1;
      }
      return { citySyncCounts: counts };
    }),
}));
