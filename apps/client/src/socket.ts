import { io, Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

export interface FeedEntry {
  type: 'pulse' | 'sync';
  ordinal: number;
  color: string;
  region: string;
  t: number;
  streak?: number;
  countries?: string[];
}

export interface ServerToClientEvents {
  'ws:joined': (data: {
    ordinal: number;
    color: string;
    streak: number;
    bestStreak: number;
    syncRequired: number;
    userCount: number;
  }) => void;
  'ws:pulse': (data: {
    userId: string;
    color: string;
    t: number;
    ordinal: number;
    x: number;
    y: number;
    region: string;
  }) => void;
  'ws:burst': (data: {
    streak: number;
    contributors: number;
    countries: string[];
    userIds: string[];
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
}

export interface ClientToServerEvents {
  'ws:join': (data: { color: string; userAgent?: string }) => void;
  'ws:pulse': (data: { x: number; y: number }) => void;
  'ws:change-color': (data: { color: string }) => void;
}

export type PulseboardSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: PulseboardSocket | null = null;

export function initSocket(): PulseboardSocket {
  if (socket) return socket;

  socket = io(SERVER_URL, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  return socket;
}

export function getSocket(): PulseboardSocket | null {
  return socket;
}
