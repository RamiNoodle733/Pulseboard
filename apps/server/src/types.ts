import type { GlobalStatsPayload } from './db/stats.js';
import type { WorldSnapshot } from './worldState.js';
import type { WorldEvent } from './eventDirector.js';
import type { XPProfile } from './xp.js';
import type { UpgradeDef, UserUpgrade, UserMultipliers } from './upgrades.js';
import type { LeaderboardEntry } from './leaderboard.js';
import type { TerritorySnapshot } from './territory.js';
import type { AchievementDef, UserAchievement } from './achievements.js';

export type { GlobalStatsPayload, WorldSnapshot, WorldEvent, XPProfile, UpgradeDef, UserUpgrade, UserMultipliers, LeaderboardEntry, TerritorySnapshot, AchievementDef, UserAchievement };

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

export interface User {
  id: string;
  ordinal: number;
  color: string;
  region: string;
  city: string;
  lat: number;
  lon: number;
  createdAt: number;
  lastPulse: number;
  lastColorChange: number;
  userAgent: string;
  ip: string;
  dbUserId: number | null;
  lastXPTick: number;
  xpBuffer: number;
  territoryId: number;
  presenceSessionId: number | null;
  presenceEnergy: number;
}

export interface Pulse {
  userId: string;
  color: string;
  t: number;
}

export interface FeedEntry {
  type: 'pulse' | 'sync';
  ordinal: number;
  color: string;
  region: string;
  t: number;
  streak?: number;
  countries?: string[];
}

export type ProposalStatus =
  | 'submitted'
  | 'generating'
  | 'pr-created'
  | 'merged'
  | 'rejected'
  | 'failed';

export interface ProposalPayload {
  id: string;
  prompt: string;
  submittedByOrdinal: number;
  submittedAt: number;
  status: ProposalStatus;
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

export interface ServerToClientEvents {
  'ws:joined': (data: {
    ordinal: number;
    color: string;
    streak: number;
    bestStreak: number;
    syncRequired: number;
    userCount: number;
    city: string;
    lat: number;
    lon: number;
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
  'ws:achievement': (data: UserAchievement) => void;
  'ws:achievement-list': (data: { achievements: UserAchievement[] }) => void;
  'ws:event-history': (data: { events: Array<{ id: string; type: string; title: string; startedAt: number }> }) => void;
  'ws:summary': (data: { text: string; period: string; generatedAt: number }) => void;
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
  'ws:get-achievements': () => void;
  'ws:get-event-history': (data: { limit?: number }) => void;
}

export interface InterServerEvents {}

export interface SocketData {
  userId: string;
  ordinal: number;
  color: string;
  userAgent: string;
  dbUserId: number | null;
  isAuthenticated: boolean;
  multipliers: UserMultipliers | null;
}

export interface WSStats {
  connectedUsers: number;
  totalUsersCreated: number;
  currentStreak: number;
  bestStreak: number;
  requiredUsers: number;
}
