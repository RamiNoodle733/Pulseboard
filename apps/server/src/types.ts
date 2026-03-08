import type { GlobalStatsPayload } from './stats.js';

export type { GlobalStatsPayload };

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
    globalStats: GlobalStatsPayload;
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
}

export interface ClientToServerEvents {
  'ws:join': (data: { color: string; userAgent?: string }) => void;
  'ws:pulse': (data: { x: number; y: number }) => void;
  'ws:change-color': (data: { color: string }) => void;
  'ws:submit-prompt': (data: { prompt: string; paymentIntentId?: string }) => void;
  'ws:vote': (data: { proposalId: string; direction: 'up' | 'down' }) => void;
}

export interface InterServerEvents {}

export interface SocketData {
  userId: string;
  ordinal: number;
  color: string;
  userAgent: string;
}

export interface WSStats {
  connectedUsers: number;
  totalUsersCreated: number;
  currentStreak: number;
  bestStreak: number;
  requiredUsers: number;
}
