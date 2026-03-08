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
  streak: number;
}

interface Store {
  joined: boolean;
  myColor: string;
  myOrdinal: number | null;
  currentStreak: number;
  bestStreak: number;
  syncRequired: number;
  connected: boolean;
  userCount: number;
  pulses: Pulse[];
  feedEntries: FeedEntry[];
  lastSync: SyncEvent | null;
  error: string | null;
  showingBurst: boolean;
  soundEnabled: boolean;

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
}

const MAX_FEED = 30;

export const useStore = create<Store>((set) => ({
  joined: false,
  myColor: '#FF6B6B',
  myOrdinal: null,
  currentStreak: 0,
  bestStreak: 0,
  syncRequired: 2,
  connected: false,
  userCount: 0,
  pulses: [],
  feedEntries: [],
  lastSync: null,
  error: null,
  showingBurst: false,
  soundEnabled: localStorage.getItem('pulseboard:sound') === 'true',

  setJoined: (ordinal, color, streak, bestStreak) =>
    set({ joined: true, myOrdinal: ordinal, myColor: color, currentStreak: streak, bestStreak }),

  setConnected: (connected) => set({ connected }),

  setUserCount: (count) => set({ userCount: count }),

  addPulse: (pulse) =>
    set((state) => ({ pulses: [...state.pulses, pulse] })),

  updateStreak: (streak, bestStreak) =>
    set((state) => ({
      currentStreak: streak,
      bestStreak: bestStreak !== undefined ? bestStreak : state.bestStreak,
    })),

  triggerBurst: (sync) => {
    set({ showingBurst: true, lastSync: sync });
    setTimeout(() => set({ showingBurst: false }), 1500);
  },

  setError: (error) => {
    set({ error });
    if (error) {
      setTimeout(() => set({ error: null }), 3000);
    }
  },

  clearOldPulses: () =>
    set((state) => ({
      pulses: state.pulses.filter((p) => Date.now() - p.t < 3000),
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
}));
