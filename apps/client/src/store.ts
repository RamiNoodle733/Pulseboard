import { create } from 'zustand';

export interface Pulse {
  id: string;
  userId: string;
  color: string;
  x: number;
  y: number;
  t: number;
  ordinal: number;
}

interface Store {
  // user state
  joined: boolean;
  myColor: string;
  myOrdinal: number | null;

  // streak state
  currentStreak: number;
  bestStreak: number;

  // sync window state
  syncWindowEnd: number;
  syncContributors: number;
  syncRequired: number;

  // connection state
  connected: boolean;
  userCount: number;

  // pulses
  pulses: Pulse[];

  // ui state
  error: string | null;
  showingBurst: boolean;
  soundEnabled: boolean;

  // actions
  setJoined: (ordinal: number, color: string, streak: number, bestStreak: number) => void;
  setConnected: (connected: boolean) => void;
  setUserCount: (count: number) => void;
  addPulse: (pulse: Pulse) => void;
  updateStreak: (streak: number, bestStreak?: number) => void;
  triggerBurst: () => void;
  setError: (error: string | null) => void;
  clearOldPulses: () => void;
  setSyncState: (windowEnd: number, contributors: number, required: number) => void;
  setSyncRequired: (required: number) => void;
  setMyColor: (color: string) => void;
  toggleSound: () => void;
}

export const useStore = create<Store>((set) => ({
  joined: false,
  myColor: '#FF6B6B',
  myOrdinal: null,
  currentStreak: 0,
  bestStreak: 0,
  syncWindowEnd: 0,
  syncContributors: 0,
  syncRequired: 2,
  connected: false,
  userCount: 0,
  pulses: [],
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

  triggerBurst: () => {
    set({ showingBurst: true });
    setTimeout(() => set({ showingBurst: false }), 600);
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

  setSyncState: (windowEnd, contributors, required) =>
    set({ syncWindowEnd: windowEnd, syncContributors: contributors, syncRequired: required }),

  setSyncRequired: (required) => set({ syncRequired: required }),

  setMyColor: (color) => set({ myColor: color }),

  toggleSound: () =>
    set((state) => {
      const next = !state.soundEnabled;
      localStorage.setItem('pulseboard:sound', String(next));
      return { soundEnabled: next };
    }),
}));
