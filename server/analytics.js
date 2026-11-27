// First-party, cookie-free analytics: daily counters only, no personal data stored.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// Events the browser may report (anything else is ignored)
export const CLIENT_EVENTS = new Set(['visit', 'clickCreate', 'clickJoin', 'clickInstall', 'installed']);
const SERVER_EVENTS = ['roomsCreated', 'joins', 'auctionsStarted', 'auctionsFinished'];
const ALL = [...CLIENT_EVENTS, ...SERVER_EVENTS];
const KEEP_DAYS = 90;

const FILE = process.env.ANALYTICS_FILE || path.join(process.env.DATA_DIR || os.tmpdir(), 'dugout-analytics.json');
const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

let data = { since: day(), days: {} };
try {
  const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (raw && typeof raw.days === 'object') data = raw;
} catch {}

let dirty = false;
export function count(event, n = 1) {
  if (!ALL.includes(event)) return;
  const d = (data.days[day()] ||= {});
  d[event] = (d[event] || 0) + n;
  dirty = true;
}

function flush() {
  if (!dirty) return;
  const keep = Object.keys(data.days).sort().slice(-KEEP_DAYS);
  data.days = Object.fromEntries(keep.map((k) => [k, data.days[k]]));
  try { fs.writeFileSync(FILE, JSON.stringify(data)); dirty = false; } catch {}
}
setInterval(flush, 30_000).unref();
for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => { flush(); process.exit(0); });

export const statsEnabled = () => !!process.env.ANALYTICS_KEY;
export function keyOk(given) {
  const want = process.env.ANALYTICS_KEY;
  if (!want || typeof given !== 'string') return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(want).digest();
  return crypto.timingSafeEqual(a, b);
}

// live = what is happening right now, taken from the in-memory rooms
export function snapshot(rooms) {
  const live = { rooms: rooms.size, lobby: 0, auction: 0, results: 0, playersOnline: 0, bots: 0 };
  for (const r of rooms.values()) {
    live[r.phase] = (live[r.phase] || 0) + 1;
    for (const m of r.members.values()) {
      if (m.bot) live.bots++;
      else if (m.connected) live.playersOnline++;
    }
  }
  const days = [];
  for (let i = 13; i >= 0; i--) days.push({ date: day(Date.now() - i * 864e5), ...Object.fromEntries(ALL.map((k) => [k, 0])), ...(data.days[day(Date.now() - i * 864e5)] || {}) });
  const total = Object.fromEntries(ALL.map((k) => [k, 0]));
  for (const d of Object.values(data.days)) for (const k of ALL) total[k] += d[k] || 0;
  const today = days[days.length - 1];
  return { live, today, total, days, since: data.since, now: new Date().toISOString() };
}
