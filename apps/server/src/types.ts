export interface User {
  id: string;
  ordinal: number;
  color: string;
  createdAt: number;
  lastPulse: number;
  lastColorChange: number;
}

export interface Pulse {
  userId: string;
  color: string;
  t: number;
  intensity?: 1 | 2 | 3;
}

export interface StreakState {
  windowStart: number;
  windowEnd: number;
  contributors: Set<string>;
  currentStreak: number;
  bestStreak: number;
  todayBestStreak: number;
}

export interface ServerToClientEvents {
  'ws:joined': (data: { ordinal: number; color: string; streak: number; bestStreak: number }) => void;
  'ws:pulse': (data: { userId: string; color: string; t: number; ordinal: number }) => void;
  'ws:burst': (data: { streak: number; contributors: number }) => void;
  'ws:streak-broken': () => void;
  'ws:user-count': (data: { count: number }) => void;
  'ws:color-changed': (data: { userId: string; color: string; ordinal: number }) => void;
  'ws:error': (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  'ws:join': (data: { color: string }) => void;
  'ws:pulse': () => void;
  'ws:change-color': (data: { color: string }) => void;
}

export interface InterServerEvents {}

export interface SocketData {
  userId: string;
  ordinal: number;
  color: string;
}
