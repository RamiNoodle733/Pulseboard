import { create } from 'zustand';

interface Pulse {
  id: string;
  userId: string;
  color: string;
  x: number;
  y: number;
  t: number;
  ordinal: number;
}

interface Store {
  // User state
  joined: boolean;
  myColor: string;
  myOrdinal: number | null;
  
  // Streak state
  currentStreak: number;
  bestStreak: number;
  
  // Connection state
  connected: boolean;
  userCount: number;
  
  // Pulses
  pulses: Pulse[];
  
  // UI state
  error: string | null;
  showingBurst: boolean;
  canPulse: boolean;
  
  // Actions
  setJoined: (ordinal: number, color: string, streak: number, bestStreak: number) => void;
  setConnected: (connected: boolean) => void;
  setUserCount: (count: number) => void;
  addPulse: (pulse: Pulse) => void;
  updateStreak: (streak: number, bestStreak?: number) => void;
  triggerBurst: () => void;
  setError: (error: string | null) => void;
  setCanPulse: (canPulse: boolean) => void;
  clearOldPulses: () => void;
  changeColor: (color: string) => void;
}

export const useStore = create<Store>((set) => ({
  // Initial state
  joined: false,
  myColor: '#FF6B6B',
  myOrdinal: null,
  currentStreak: 0,
  bestStreak: 0,
  connected: false,
  userCount: 0,
  pulses: [],
  error: null,
  showingBurst: false,
  canPulse: true,
  
  // Actions
  setJoined: (ordinal, color, streak, bestStreak) =>
    set({ joined: true, myOrdinal: ordinal, myColor: color, currentStreak: streak, bestStreak }),
  
  setConnected: (connected) => set({ connected }),
  
  setUserCount: (count) => set({ userCount: count }),
  
  addPulse: (pulse) =>
    set((state) => ({
      pulses: [...state.pulses, pulse],
    })),
  
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
  
  setCanPulse: (canPulse) => set({ canPulse }),
  
  clearOldPulses: () =>
    set((state) => ({
      pulses: state.pulses.filter((p) => Date.now() - p.t < 3000),
    })),
  
  changeColor: (color) => set({ myColor: color }),
}));
