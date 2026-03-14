import { io, Socket } from 'socket.io-client';

const SERVER_URL = (import.meta.env.VITE_SERVER_URL || 'http://localhost:3000').replace(/\/+$/, '');

export { SERVER_URL };

export interface FeedEntry {
  type: 'pulse' | 'sync';
  ordinal: number;
  color: string;
  region: string;
  t: number;
  streak?: number;
  countries?: string[];
}

export interface GlobalStatsPayload {
  totalPulses: number;
  totalSyncs: number;
  bestStreakAllTime: number;
  activeCities: number;
  topCities: Array<{ city: string; pulses: number; syncs: number }>;
  pulsesPerMinute: number;
}

export interface ProposalPayload {
  id: string;
  prompt: string;
  submittedByOrdinal: number;
  submittedAt: number;
  status: string;
  summary: string | null;
  reasoning: string | null;
  changedFiles: string[];
  prUrl: string | null;
  upvoteCount: number;
  downvoteCount: number;
  myVote: 'up' | 'down' | null;
  resolvedAt: number | null;
  error: string | null;
}

export type WorldPhaseName = 'surging' | 'cooling' | 'converging' | 'dormant' | 'active';

export interface WorldSnapshot {
  totalEnergy: number;
  cities: Array<{
    city: string;
    energy: number;
    momentum: number;
  }>;
  phase: {
    name: WorldPhaseName;
    intensity: number;
    startedAt: number;
  };
  hotZones: string[];
  risingCities: string[];
}

export interface WorldEvent {
  id: string;
  type: 'surge' | 'convergence' | 'resonance_wave' | 'city_awakening' | 'quiet_zone' | 'record_broken';
  title: string;
  cities: string[];
  startedAt: number;
  duration: number;
  intensity: number;
}

// Gamification types
export interface XPProfile {
  userId: number;
  xp: number;
  totalXP: number;
  level: number;
  xpToNextLevel: number;
  loginStreak: number;
}

export interface UpgradeDef {
  id: number;
  slug: string;
  name: string;
  description: string;
  category: 'power' | 'cosmetic' | 'territory';
  maxLevel: number;
  baseCost: number;
  costMultiplier: number;
  effectType: string;
  effectValue: number;
}

export interface UserUpgrade {
  upgradeId: number;
  slug: string;
  name: string;
  category: string;
  level: number;
  maxLevel: number;
}

export interface UserMultipliers {
  pulseRateMult: number;
  energyMult: number;
  influenceRadius: number;
  cityEnergyMult: number;
  diffusionRange: number;
  trailStyle: number;
  particleStyle: number;
  extraColors: number;
  badgeTier: number;
  territoryClaimBonus: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: number;
  username: string | null;
  avatarUrl: string | null;
  score: number;
  level?: number;
}

export interface UserProfilePayload {
  userId: number;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  color: string;
  xp: XPProfile;
  upgrades: UserUpgrade[];
  multipliers: UserMultipliers;
  stats: {
    totalEnergyContributed: number;
    citiesInfluenced: number;
    syncsParticipated: number;
    memberSince: number;
  };
}

export interface TerritorySnapshotEntry {
  id: number;
  name: string;
  type: string;
  parentId: number | null;
  energy: number;
  momentum: number;
  activeUsers: number;
}

export interface TerritorySnapshot {
  territories: TerritorySnapshotEntry[];
  topCities: Array<{ name: string; energy: number; momentum: number }>;
  topCountries: Array<{ name: string; energy: number }>;
  worldEnergy: number;
}

export interface ServerToClientEvents {
  'ws:joined': (data: {
    ordinal: number;
    color: string;
    streak: number;
    bestStreak: number;
    syncRequired: number;
    userCount: number;
    city: string;
    globalStats: GlobalStatsPayload;
    isAuthenticated: boolean;
    authUsername: string | null;
    authAvatarUrl: string | null;
    xp: XPProfile | null;
    multipliers: UserMultipliers | null;
  }) => void;
  'ws:pulse': (data: {
    userId: string;
    color: string;
    t: number;
    ordinal: number;
    x: number;
    y: number;
    region: string;
    city: string;
    energy: number;
  }) => void;
  'ws:burst': (data: {
    streak: number;
    contributors: number;
    countries: string[];
    userIds: string[];
    cities: string[];
    distanceKm: number | null;
    cityPair: string | null;
  }) => void;
  'ws:streak-broken': () => void;
  'ws:user-count': (data: { count: number }) => void;
  'ws:color-changed': (data: {
    userId: string;
    color: string;
    ordinal: number;
  }) => void;
  'ws:error': (data: { message: string }) => void;
  'ws:feed': (data: FeedEntry) => void;
  'ws:global-stats': (data: GlobalStatsPayload) => void;
  'ws:proposals': (data: { proposals: ProposalPayload[] }) => void;
  'ws:proposal-update': (data: ProposalPayload) => void;
  'ws:prompt-ack': (data: { proposalId: string; freePromptsRemaining: number }) => void;
  'ws:prompt-info': (data: { freePromptsRemaining: number; freePromptsTotal: number; paidEnabled: boolean }) => void;
  'ws:world-state': (data: WorldSnapshot) => void;
  'ws:world-event': (data: WorldEvent) => void;
  'ws:narration': (data: { text: string; t: number }) => void;
  'ws:insight': (data: { text: string; t: number }) => void;
  'ws:search-results': (data: { proposals: ProposalPayload[]; total: number }) => void;
  'ws:xp-update': (data: { xp: number; totalXP: number; level: number; xpToNextLevel: number; leveledUp: boolean }) => void;
  'ws:profile': (data: UserProfilePayload) => void;
  'ws:upgrades-list': (data: { upgrades: UpgradeDef[] }) => void;
  'ws:upgrade-result': (data: { success: boolean; error?: string; upgrade?: UserUpgrade; newXP?: number }) => void;
  'ws:leaderboard': (data: { type: string; entries: LeaderboardEntry[] }) => void;
  'ws:multipliers': (data: UserMultipliers) => void;
  'ws:territory-update': (data: TerritorySnapshot) => void;
}

export interface ClientToServerEvents {
  'ws:join': (data: { color: string; userAgent?: string; deviceId?: string }) => void;
  'ws:pulse': (data: { x: number; y: number }) => void;
  'ws:presence': (data: { x: number; y: number; vx: number; vy: number }) => void;
  'ws:change-color': (data: { color: string }) => void;
  'ws:submit-prompt': (data: { prompt: string; paymentIntentId?: string }) => void;
  'ws:vote': (data: { proposalId: string; direction: 'up' | 'down' }) => void;
  'ws:search-proposals': (data: { query: string; status?: string; limit?: number; offset?: number }) => void;
  'ws:get-profile': () => void;
  'ws:get-upgrades': () => void;
  'ws:purchase-upgrade': (data: { upgradeSlug: string }) => void;
  'ws:get-leaderboard': (data: { type: string; limit?: number }) => void;
}

export type PulseboardSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: PulseboardSocket | null = null;

export function getDeviceId(): string {
  let id = localStorage.getItem('pulseboard:deviceId');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem('pulseboard:deviceId', id);
  }
  return id;
}

export function initSocket(): PulseboardSocket {
  if (socket) return socket;

  const token = localStorage.getItem('pulseboard:token');

  socket = io(SERVER_URL, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    auth: token ? { token } : undefined,
  });

  return socket;
}

export function getSocket(): PulseboardSocket | null {
  return socket;
}
