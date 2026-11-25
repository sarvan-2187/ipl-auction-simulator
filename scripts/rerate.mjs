// Recalculate ratings OFFLINE from the existing player list + cached stats. No downloads.
// Usage: npm run rerate
// Needs scripts/.cache/stats/*.json (written by fetch-data) and scripts/.cache/retention.json.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rateAll, norm } from './ratings.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'scripts', '.cache');
const num = (x) => (Number.isFinite(+x) ? +x : 0);

const current = JSON.parse(await fs.readFile(path.join(ROOT, 'server', 'players.json'), 'utf8'));

// Cached stats, keyed by gid
const statsByGid = new Map();
for (const f of await fs.readdir(path.join(CACHE, 'stats'))) {
  try { statsByGid.set(f.replace(/\.json$/, ''), JSON.parse(await fs.readFile(path.join(CACHE, 'stats', f), 'utf8'))); } catch {}
}
// Older player lists don't carry gid: match by career totals instead
const byTotals = new Map();
for (const [gid, d] of statsByGid) {
  const c = d?.careerTables?.batting?.career || {}, b = d?.careerTables?.bowling?.career || {};
  const key = `${num(c.matches) || num(b.matches)}|${num(c.runs)}|${num(b.wickets)}`;
  byTotals.set(key, byTotals.has(key) ? null : gid); // null = ambiguous
}

// id -> gid links saved by fetch-data (and seeded from earlier scrapes)
let gidOf = {};
try { gidOf = JSON.parse(await fs.readFile(path.join(CACHE, 'gids.json'), 'utf8')); } catch {}
const byRunsWkts = new Map();
for (const [gid, d] of statsByGid) {
  const c = d?.careerTables?.batting?.career || {}, b = d?.careerTables?.bowling?.career || {};
  const key = `${num(c.runs)}|${num(b.wickets)}|${num(c.strikeRate)}`;
  byRunsWkts.set(key, byRunsWkts.has(key) ? null : gid);
}

const retained = new Map();
try {
  for (const r of JSON.parse(await fs.readFile(path.join(CACHE, 'retention.json'), 'utf8'))) retained.set(norm(r.displayName), r);
} catch { console.warn('No cached retention list: retention boosts and capped flags from it are skipped.'); }

const players = new Map();
const statsOf = new Map();
let matched = 0;
for (const p of current) {
  const gid = p.gid || gidOf[String(p.id)] || (p.m > 0 ? byTotals.get(`${p.m}|${p.runs}|${p.wkts}`) || byRunsWkts.get(`${p.runs}|${p.wkts}|${p.sr}`) : null) || null;
  const st = gid ? statsByGid.get(gid) : null;
  if (st) matched++;
  const seasonsPlayed = [...new Set([...(st?.careerTables?.batting?.rows || []), ...(st?.careerTables?.bowling?.rows || [])].map((r) => r.season))].sort().reverse();
  players.set(p.id, {
    id: p.id, gid, name: p.name, role: p.role, country: p.country, cc: p.cc, overseas: p.overseas,
    seasons: seasonsPlayed.length ? seasonsPlayed : ['2026'], imgs: [],
  });
  statsOf.set(p.id, st || null);
}
console.log(`matched cached stats for ${matched}/${current.length} players (${current.filter((p) => p.m > 0).length} have IPL matches)`);

const photoOf = new Map(current.map((p) => [p.id, p.photo]));
const out = rateAll(players, statsOf, retained).map((p) => {
  delete p._imgs;
  // keep fields the online refresh owns
  const old = current.find((x) => x.id === p.id);
  // a player we couldn't link to cached stats keeps the stat line he already had
  const keep = statsOf.get(p.id) ? {} : { m: old.m, runs: old.runs, sr: old.sr, wkts: old.wkts, econ: old.econ };
  return { ...p, ...keep, seasons: old.seasons, age: p.age ?? old.age, photo: photoOf.get(p.id) ?? null };
});
for (const f of [path.join(ROOT, 'server', 'players.json'), path.join(ROOT, 'client', 'public', 'data', 'players.json')]) {
  await fs.writeFile(f, JSON.stringify(out));
}
console.log(`wrote ${out.length} players`);
