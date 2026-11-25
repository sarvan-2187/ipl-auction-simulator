import { io, Socket } from 'socket.io-client';
import { useEffect, useSyncExternalStore } from 'react';
import type { RoomState } from './types';

function store(key: string, fallback: () => string) {
  try {
    const v = localStorage.getItem(key);
    if (v) return v;
    const n = fallback();
    localStorage.setItem(key, n);
    return n;
  } catch {
    return fallback();
  }
}

export const memberId = store('ipl.memberId', () =>
  (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)),
);

export function getName() {
  try { return localStorage.getItem('ipl.name') || ''; } catch { return ''; }
}
export function setName(n: string) {
  try { localStorage.setItem('ipl.name', n); } catch {}
}

export const socket: Socket = io({ transports: ['websocket', 'polling'], reconnectionDelayMax: 3000 });

type Ack = { ok: boolean; error?: string; code?: string };

let state: RoomState | null = null;
let connected = socket.connected;
let currentCode: string | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

socket.on('state', (s: RoomState) => {
  state = { ...s, receivedAt: performance.now() };
  emit();
});
socket.on('connect', () => {
  connected = true;
  emit();
  // transparently re-join after a drop / server restart
  if (currentCode) socket.emit('join', { code: currentCode, memberId, name: getName() }, () => {});
});
socket.on('disconnect', () => { connected = false; emit(); });

// Free hosts (e.g. Render) sleep after ~15 min without HTTP requests even while WebSockets are open.
// While you're in a room, ping every 4 minutes so a long auction never gets put to sleep.
setInterval(() => {
  if (currentCode && document.visibilityState === 'visible') fetch('/api/health', { cache: 'no-store' }).catch(() => {});
}, 4 * 60 * 1000);

export function useRoom() {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f); },
    () => state,
  );
}
export function useConnected() {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f); },
    () => connected,
  );
}

export function call(event: string, payload: object = {}): Promise<Ack> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'Server not responding' }), 8000);
    socket.emit(event, payload, (res: Ack) => { clearTimeout(timer); resolve(res); });
  });
}

export async function createRoom(name: string) {
  const r = await call('create', { memberId, name });
  if (r.ok) currentCode = r.code!;
  return r;
}
export async function joinRoom(code: string, name: string) {
  const r = await call('join', { code, memberId, name });
  if (r.ok) currentCode = r.code!;
  return r;
}
export function leaveRoom() {
  currentCode = null;
  state = null;
  emit();
}

export function useSocketEvent<T>(event: string, fn: (p: T) => void) {
  useEffect(() => {
    socket.on(event, fn);
    return () => { socket.off(event, fn); };
  }, [event, fn]);
}
