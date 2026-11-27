// Live rating trends: the stored ratings are the base; current ICC men's T20I rankings add a
// bonus on top. Refreshing (button on /admin/stats, or the daily timer) recomputes every player
// from base + rankings, so it never compounds.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FIXED_RATINGS } from '../scripts/ratings-scale.mjs';

const FILE = process.env.RANKINGS_FILE || path.join(process.env.DATA_DIR || os.tmpdir(), 'dugout-rankings.json');
const CATS = ['batting', 'bowling', 'allrounder'];
const SKILL = { batting: 'BAT', bowling: 'BOWL', allrounder: 'AR' };
const SOFT_CAP = 98; // rankings can lift a player to 98; 99 and 100 stay hand-picked
const TOP_N = 50;

// ICC page per category; override with RANKINGS_URLS='{"batting":"...","bowling":"...","allrounder":"..."}'
const DEFAULT_URLS = {
  batting: 'https://www.icc-cricket.com/rankings/mens/player-rankings/t20/batting',
  bowling: 'https://www.icc-cricket.com/rankings/mens/player-rankings/t20/bowling',
  allrounder: 'https://www.icc-cricket.com/rankings/mens/player-rankings/t20/all-rounder',
};
const urls = () => { try { return { ...DEFAULT_URLS, ...JSON.parse(process.env.RANKINGS_URLS || '{}') }; } catch { return DEFAULT_URLS; } };

// Bonus points by rank
export const bonusFor = (rank) => (rank === 1 ? 4 : rank <= 3 ? 3 : rank <= 10 ? 2 : rank <= 25 ? 1 : 0);

// ---------- names ----------
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
function lev(a, b) {
  const m = a.length, n = b.length; if (Math.abs(m - n) > 3) return 9;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
export function matchPlayer(players, name) {
  const n = norm(name); if (!n) return null;
  const list = players.map((p) => ({ p, n: norm(p.name) }));
  const exact = list.find((x) => x.n === n); if (exact) return exact.p;
  const close = list.map((x) => ({ x, d: lev(x.n, n) })).filter((o) => o.d <= 2 && o.x.n[0] === n[0]).sort((a, b) => a.d - b.d);
  if (close.length && (close.length === 1 || close[0].d < close[1].d)) return close[0].x.p;
  const parts = n.split(' '), last = parts[parts.length - 1], first = parts[0][0];
  const byLast = list.filter((x) => { const q = x.n.split(' '); return q[q.length - 1] === last && q[0][0] === first; });
  return byLast.length === 1 ? byLast[0].p : null;
}

// ---------- parsing ----------
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"');
export function parseRankings(text) {
  const t = String(text || '').trim(); if (!t) return [];
  if (t[0] === '[' || t[0] === '{') {
    try {
      const j = JSON.parse(t);
      const arr = Array.isArray(j) ? j : Object.values(j).find(Array.isArray) || [];
      const out = arr.map((x, i) => ({
        name: x.name || x.playerName || x.player?.name || x.player?.fullName || x.fullName,
        rank: +(x.rank ?? x.position ?? x.pos ?? i + 1),
        rating: x.rating != null ? +x.rating : undefined,
      })).filter((x) => x.name);
      if (out.length) return out;
    } catch {}
  }
  const lines = decode(t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(tr|li|div|p|h\d)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const rows = [];
  for (const l of lines) {
    const m = l.match(/^(\d{1,3})[\s.,;:\-–]+([A-Za-z][A-Za-z .'’-]{2,40}?)(?:[\s,;:]+(?:[A-Z]{2,4}\b)?\s*(\d{3,4}))?$/) || l.match(/^(\d{1,3})[\s.,;:\-–]+([A-Za-z][A-Za-z .'’-]{2,40}?)[\s,;:]+[A-Za-z .'’-]{2,20}[\s,;:]+(\d{3,4})$/);
    if (m) rows.push({ name: m[2].replace(/\s+[A-Z]{2,4}$/, '').trim(), rank: +m[1], rating: m[3] ? +m[3] : undefined });
  }
  if (rows.length >= 5) return rows;
  // plain list of names, best first
  const names = lines.filter((l) => /^[A-Za-z][A-Za-z .'’-]{2,40}$/.test(l));
  return names.length >= 5 ? names.map((name, i) => ({ name, rank: i + 1 })) : rows;
}

// ---------- state ----------
let base = new Map();   // id -> { rating, ratings }
let state = { updatedAt: null, source: null, rankings: { batting: [], bowling: [], allrounder: [] }, last: { moved: [], matched: 0, unmatched: [] } };
try { const s = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (s && s.rankings) state = s; } catch {}
const save = () => { try { fs.writeFileSync(FILE, JSON.stringify(state)); } catch {} };

export function initRatings(players) {
  base = new Map(players.map((p) => [p.id, { rating: p.rating, ratings: { ...p.ratings } }]));
  if (state.updatedAt) applyRankings(players, state.rankings, false);
}

// Recompute every player = base + ranking bonuses. Mutates players in place.
export function applyRankings(players, rankings, record = true) {
  const bonus = new Map();   // id -> { BAT, BOWL, AR }
  const unmatched = [];
  let matched = 0;
  for (const cat of CATS) {
    for (const r of (rankings[cat] || []).filter((x) => x.rank <= TOP_N)) {
      const p = matchPlayer(players, r.name);
      if (!p) { unmatched.push(`${cat} #${r.rank} ${r.name}`); continue; }
      matched++;
      const b = bonusFor(r.rank); if (!b) continue;
      bonus.set(p.id, { ...(bonus.get(p.id) || {}), [SKILL[cat]]: b });
    }
  }
  const moved = [];
  for (const p of players) {
    const b0 = base.get(p.id); if (!b0) continue;
    const bn = bonus.get(p.id) || {};
    const fixed = FIXED_RATINGS.get(p.name.toLowerCase());
    const head = p.role === 'WK' ? bn.BAT || 0 : p.role === 'AR' ? Math.max(bn.AR || 0, ((bn.BAT || 0) + (bn.BOWL || 0)) / 2) : bn[p.role] || 0;
    const rating = fixed ?? Math.min(Math.max(b0.rating, SOFT_CAP), Math.round(b0.rating + head));
    const out = {};
    for (const k of Object.keys(b0.ratings)) {
      const v = b0.ratings[k]; if (v == null) { out[k] = v; continue; }
      out[k] = k === p.role ? rating : Math.min(rating, SOFT_CAP, Math.round(v + (bn[k] || 0)));
    }
    if (rating !== p.rating && record) moved.push({ name: p.name, from: p.rating, to: rating });
    p.rating = rating; p.ratings = out;
  }
  if (record) state.last = { moved: moved.sort((a, b) => b.to - b.from - (a.to - a.from)).slice(0, 40), matched, unmatched: unmatched.slice(0, 40) };
  return { matched, unmatched: unmatched.length, changed: moved.length };
}

async function fetchText(url) {
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; DugoutRatings/1.0)', accept: 'application/json,text/html' }, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(to); }
}

// source: 'icc' fetches the live pages; 'manual' takes {batting, bowling, allrounder} pasted text
export async function refresh(players, { manual } = {}) {
  const rankings = { batting: [], bowling: [], allrounder: [] };
  const errors = [];
  if (manual) {
    for (const c of CATS) rankings[c] = parseRankings(manual[c]);
  } else {
    const u = urls();
    for (const c of CATS) {
      try { rankings[c] = parseRankings(await fetchText(u[c])); } catch (e) { errors.push(`${c}: ${e.message}`); }
    }
  }
  const got = CATS.reduce((n, c) => n + rankings[c].length, 0);
  if (!got) return { ok: false, error: errors.length ? `Could not fetch rankings (${errors.join('; ')}). Paste them in instead.` : 'No rankings found in that text.' };
  // categories that came back empty keep their previous ranking
  for (const c of CATS) if (!rankings[c].length && state.rankings[c]?.length) rankings[c] = state.rankings[c];
  const res = applyRankings(players, rankings);
  state.rankings = rankings; state.updatedAt = new Date().toISOString(); state.source = manual ? 'manual paste' : 'ICC T20I rankings';
  save();
  return { ok: true, ...res, errors };
}

export const status = () => ({
  updatedAt: state.updatedAt, source: state.source,
  counts: Object.fromEntries(CATS.map((c) => [c, state.rankings[c]?.length || 0])),
  last: state.last,
  top: Object.fromEntries(CATS.map((c) => [c, (state.rankings[c] || []).slice(0, 5).map((x) => `${x.rank}. ${x.name}`)])),
});
