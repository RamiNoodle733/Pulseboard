import { io, Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

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

  socket.on('connect', () => {
    console.log('🔌 Connected to server');
  });

  socket.on('disconnect', () => {
    console.log('🔌 Disconnected from server');
  });

  return socket;
}

export function getSocket(): PulseboardSocket | null {
  return socket;
}
