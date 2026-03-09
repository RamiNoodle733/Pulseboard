import { create } from 'zustand';
import type { FeedEntry, GlobalStatsPayload, ProposalPayload, WorldSnapshot, WorldEvent } from './socket';

export interface Pulse {
  id: string;
  userId: string;
  color: string;
  x: number;
  y: number;
  t: number;
  ordinal: number;
  region: string;
  city: string;
  energy: number;
}

export interface SyncEvent {
  t: number;
  userIds: string[];
  countries: string[];
  cities: string[];
  streak: number;
}

export interface CityTick {
  city: string;
  color: string;
  t: number;
}

interface Store {
  // Connection & identity
  joined: boolean;
  myColor: string;
  myOrdinal: number | null;
  myUserId: string | null;
  myRegion: string;
  myCity: string;
  connected: boolean;
  audioUnlocked: boolean;

  // Streaks / Resonance
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
  sessionEnergy: number;

  // City leaderboard
  citySyncCounts: Record<string, number>;

  // Global stats (server-persisted)
  globalPulses: number;
  globalSyncs: number;
  bestStreakAllTime: number;
  activeCities: number;
  pulsesPerMinute: number;
  topCities: Array<{ city: string; pulses: number; syncs: number }>;
  myCityRank: number;

  // Sync distance flash
  lastSyncDistance: number | null;
  lastSyncCityPair: string | null;
  lastSyncDistanceTime: number;

  // City ticker
  cityTicker: CityTick[];

  // World state
  worldState: WorldSnapshot | null;
  currentEvent: WorldEvent | null;
  narration: string | null;
  insight: string | null;

  // Overlay state
  showShareCard: boolean;
  lastShareableSync: SyncEvent | null;

  // Proposals / AI
  proposals: ProposalPayload[];
  freePromptsRemaining: number;
  freePromptsTotal: number;
  paidEnabled: boolean;
  aiEnabled: boolean;
  showProposalFeed: boolean;

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

  setMyUserId: (userId: string) => void;
  setMyRegion: (region: string) => void;
  setMyCity: (city: string) => void;
  incrementPulsesSent: () => void;
  incrementPulsesReceived: () => void;
  incrementSyncs: () => void;
  incrementSessionEnergy: (amount: number) => void;
  updateActivityLevel: (delta: number) => void;
  decayActivityLevel: () => void;
  setShowShareCard: (show: boolean) => void;
  setLastShareableSync: (sync: SyncEvent) => void;
  updateCitySyncCounts: (cities: string[]) => void;
  setGlobalStats: (stats: GlobalStatsPayload) => void;
  setSyncDistance: (km: number | null, pair: string | null) => void;
  addCityTick: (city: string, color: string) => void;
  setAudioUnlocked: () => void;

  // World state actions
  setWorldState: (snapshot: WorldSnapshot) => void;
  setCurrentEvent: (event: WorldEvent | null) => void;
  setNarration: (text: string | null) => void;
  setInsight: (text: string | null) => void;

  setProposals: (proposals: ProposalPayload[]) => void;
  upsertProposal: (proposal: ProposalPayload) => void;
  setPromptInfo: (remaining: number, total: number, paidEnabled: boolean) => void;
  setFreePromptsRemaining: (remaining: number) => void;
  setShowProposalFeed: (show: boolean) => void;
}

const MAX_FEED = 30;
const MAX_TICKER = 30;

export const useStore = create<Store>((set) => ({
  joined: false,
  myColor: '#FF6B6B',
  myOrdinal: null,
  myUserId: null,
  myRegion: '',
  myCity: '',
  connected: false,
  audioUnlocked: false,

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
  sessionEnergy: 0,

  citySyncCounts: {},

  globalPulses: 0,
  globalSyncs: 0,
  bestStreakAllTime: 0,
  activeCities: 0,
  pulsesPerMinute: 0,
  topCities: [],
  myCityRank: 0,

  lastSyncDistance: null,
  lastSyncCityPair: null,
  lastSyncDistanceTime: 0,

  cityTicker: [],

  worldState: null,
  currentEvent: null,
  narration: null,
  insight: null,

  showShareCard: false,
  lastShareableSync: null,

  proposals: [],
  freePromptsRemaining: 0,
  freePromptsTotal: 0,
  paidEnabled: false,
  aiEnabled: false,
  showProposalFeed: false,

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

  setMyUserId: (userId) => set({ myUserId: userId }),
  setMyRegion: (region) => set({ myRegion: region }),
  setMyCity: (city) => set({ myCity: city }),

  incrementPulsesSent: () =>
    set((state) => ({ totalPulsesSent: state.totalPulsesSent + 1 })),

  incrementPulsesReceived: () =>
    set((state) => ({ totalPulsesReceived: state.totalPulsesReceived + 1 })),

  incrementSyncs: () =>
    set((state) => ({ syncsParticipatedIn: state.syncsParticipatedIn + 1 })),

  incrementSessionEnergy: (amount) =>
    set((state) => ({ sessionEnergy: state.sessionEnergy + amount })),

  updateActivityLevel: (delta) =>
    set((state) => ({ activityLevel: Math.min(1, state.activityLevel + delta) })),

  decayActivityLevel: () =>
    set((state) => ({ activityLevel: state.activityLevel * 0.95 })),

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

  setGlobalStats: (stats) =>
    set((state) => {
      let rank = 0;
      if (state.myCity) {
        const idx = stats.topCities.findIndex((c) => c.city === state.myCity);
        rank = idx >= 0 ? idx + 1 : 0;
      }
      return {
        globalPulses: stats.totalPulses,
        globalSyncs: stats.totalSyncs,
        bestStreakAllTime: stats.bestStreakAllTime,
        activeCities: stats.activeCities,
        pulsesPerMinute: stats.pulsesPerMinute,
        topCities: stats.topCities,
        myCityRank: rank,
      };
    }),

  setSyncDistance: (km, pair) =>
    set({ lastSyncDistance: km, lastSyncCityPair: pair, lastSyncDistanceTime: Date.now() }),

  addCityTick: (city, color) =>
    set((state) => {
      const now = Date.now();
      const filtered = state.cityTicker.filter((t) => now - t.t < 15000);
      return { cityTicker: [...filtered, { city, color, t: now }].slice(-MAX_TICKER) };
    }),

  setAudioUnlocked: () => set({ audioUnlocked: true }),

  setWorldState: (snapshot) => set({ worldState: snapshot }),
  setCurrentEvent: (event) => set({ currentEvent: event }),
  setNarration: (text) => set({ narration: text }),
  setInsight: (text) => set({ insight: text }),

  setProposals: (proposals) => set({ proposals }),

  upsertProposal: (proposal) =>
    set((state) => {
      const idx = state.proposals.findIndex((p) => p.id === proposal.id);
      if (idx >= 0) {
        const updated = [...state.proposals];
        updated[idx] = proposal;
        return { proposals: updated };
      }
      return { proposals: [proposal, ...state.proposals] };
    }),

  setPromptInfo: (remaining, total, paidEnabled) =>
    set({ freePromptsRemaining: remaining, freePromptsTotal: total, paidEnabled, aiEnabled: true }),

  setFreePromptsRemaining: (remaining) => set({ freePromptsRemaining: remaining }),

  setShowProposalFeed: (show) => set({ showProposalFeed: show }),
}));
