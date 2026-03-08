export interface User {
  id: string;
  ordinal: number;
  color: string;
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

export interface ServerToClientEvents {
  'ws:joined': (data: {
    ordinal: number;
    color: string;
    streak: number;
    bestStreak: number;
    syncRequired: number;
  }) => void;
  'ws:pulse': (data: {
    userId: string;
    color: string;
    t: number;
    ordinal: number;
    x: number;
    y: number;
  }) => void;
  'ws:burst': (data: { streak: number; contributors: number }) => void;
  'ws:streak-broken': () => void;
  'ws:user-count': (data: { count: number }) => void;
  'ws:sync-state': (data: {
    windowEnd: number;
    contributors: number;
    required: number;
  }) => void;
  'ws:color-changed': (data: {
    userId: string;
    color: string;
    ordinal: number;
  }) => void;
  'ws:error': (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  'ws:join': (data: { color: string; userAgent?: string }) => void;
  'ws:pulse': () => void;
  'ws:change-color': (data: { color: string }) => void;
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
  windowEnd: number;
  contributors: number;
  requiredUsers: number;
}
