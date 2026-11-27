// Live rating trends: the stored ratings are the base; current ICC men's T20I rankings add a
// bonus on top. Refreshing (button on /admin/stats, or the daily timer) recomputes every player
// from base + rankings, so it never compounds.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as store from './gh-store.js';
import { FIXED_RATINGS } from '../scripts/ratings-scale.mjs';

const FILE = process.env.RANKINGS_FILE || path.join(process.env.DATA_DIR || os.tmpdir(), 'dugout-rankings.json');
const CATS = ['batting', 'bowling', 'allrounder'];
const SKILL = { batting: 'BAT', bowling: 'BOWL', allrounder: 'AR' };
const SOFT_CAP = 98; // rankings can lift a player to 98; 99 and 100 stay hand-picked
const TOP_N = 50;

// ICC pages per category, tried in order (the site has moved its URLs before).
// Override with RANKINGS_URLS='{"batting":"...","bowling":"...","allrounder":"..."}' (a string or a list).
const DEFAULT_URLS = {
  batting: ['https://www.icc-cricket.com/rankings/batting/mens/t20i', 'https://www.icc-cricket.com/rankings/mens/player-rankings/t20i/batting', 'https://www.icc-cricket.com/rankings/mens/player-rankings/t20/batting'],
  bowling: ['https://www.icc-cricket.com/rankings/bowling/mens/t20i', 'https://www.icc-cricket.com/rankings/mens/player-rankings/t20i/bowling', 'https://www.icc-cricket.com/rankings/mens/player-rankings/t20/bowling'],
  allrounder: ['https://www.icc-cricket.com/rankings/allrounder/mens/t20i', 'https://www.icc-cricket.com/rankings/all-rounder/mens/t20i', 'https://www.icc-cricket.com/rankings/mens/player-rankings/t20i/all-rounder', 'https://www.icc-cricket.com/rankings/mens/player-rankings/t20/all-rounder'],
};
const urls = () => {
  let o = {}; try { o = JSON.parse(process.env.RANKINGS_URLS || '{}'); } catch {}
  return Object.fromEntries(CATS.map((c) => [c, o[c] ? [].concat(o[c]) : DEFAULT_URLS[c]]));
};

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
const nameOf = (x) => x && (x.player_name || x.PlayerName || x.Player || x.name || x.playerName || x.fullName || x.displayName || x.player?.fullName || x.player?.name || x.player?.displayName || x.player?.shortName);
const rankOf = (x) => +(x.rank ?? x.Rank ?? x.position ?? x.pos ?? x.ranking ?? x.currentRank ?? x.no);
// Walk any JSON value and return the longest array that looks like a ranking table
function findRankingArray(v, depth = 0) {
  let best = [];
  if (!v || typeof v !== 'object' || depth > 12) return best;
  if (Array.isArray(v)) {
    const rows = v.filter((x) => x && typeof x === 'object' && typeof nameOf(x) === 'string' && Number.isFinite(rankOf(x)));
    if (rows.length >= 5 && rows.length >= v.length * 0.6) best = rows;
  }
  for (const k of Object.keys(v)) { const r = findRankingArray(v[k], depth + 1); if (r.length > best.length) best = r; }
  return best;
}
function fromJSON(j) {
  return findRankingArray(j).map((x) => ({ name: nameOf(x), rank: rankOf(x), rating: Number.isFinite(+(x.rating ?? x.points)) ? +(x.rating ?? x.points) : undefined }))
    .sort((a, b) => a.rank - b.rank);
}

// Next.js App Router pages ship their data as escaped JS strings: self.__next_f.push([1,"..."]).
// Unescape those, then try every JSON array of objects in them and keep the best ranking-shaped one.
function flightText(html) {
  const parts = [];
  for (const m of html.matchAll(/self\.__next_f\.push\(\[\d+,\s*("(?:[^"\\]|\\.)*")\]\)/g)) { try { parts.push(JSON.parse(m[1])); } catch {} }
  return parts.join('');
}
function arraysIn(text, limit = 4000) {
  const out = [];
  let i = 0, n = 0;
  while ((i = text.indexOf('[{', i)) !== -1 && n++ < limit) {
    let depth = 0, inStr = false, j = i;
    for (; j < text.length; j++) {
      const ch = text[j];
      if (inStr) { if (ch === '\\') j++; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true; else if (ch === '[' || ch === '{') depth++; else if (ch === ']' || ch === '}') { depth--; if (!depth) break; }
    }
    if (!depth) { try { out.push(JSON.parse(text.slice(i, j + 1))); } catch {} }
    i += 2;
  }
  return out;
}
export function fromEmbedded(html) {
  let best = [];
  for (const src of [flightText(html), html]) {
    if (!src) continue;
    for (const arr of arraysIn(src)) { const rows = fromJSON(arr); if (rows.length > best.length) best = rows; }
    if (best.length >= 5) break;
  }
  return best;
}
// For diagnosis: what the page's embedded data looks like around ranking-ish keys
export function sampleData(html) {
  const f = flightText(html);
  const src = f || html;
  const out = [`next data blobs: ${f ? f.length + ' chars' : 'none'}`];
  const re = /"(?:rank|Rank|position|rating|points)"\s*:/g; let m, k = 0;
  while ((m = re.exec(src)) && k++ < 3) out.push(src.slice(Math.max(0, m.index - 220), m.index + 220));
  return out;
}

export function parseRankings(text, { pasted = false } = {}) {
  const t = String(text || '').trim(); if (!t) return [];
  // JSON embedded in an HTML page (Next.js and similar)
  if (t[0] === '<') {
    const deep = fromEmbedded(t); if (deep.length >= 5) return deep;
    for (const m of t.matchAll(/<script[^>]*type="application\/(?:ld\+)?json"[^>]*>([\s\S]*?)<\/script>/gi)) {
      try { const rows = fromJSON(JSON.parse(m[1])); if (rows.length >= 5) return rows; } catch {}
    }
  }
  if (t[0] === '[' || t[0] === '{') {
    try {
      const j = JSON.parse(t);
      const deep = fromJSON(j); if (deep.length >= 5) return deep;
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
  return pasted && names.length >= 5 ? names.map((name, i) => ({ name, rank: i + 1 })) : rows;
}

// ---------- state ----------
let base = new Map();   // id -> { rating, ratings }
let state = { updatedAt: null, source: null, rankings: { batting: [], bowling: [], allrounder: [] }, last: { moved: [], matched: 0, unmatched: [] } };
try { const s = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (s && s.rankings) state = s; } catch {}
const save = () => {
  try { fs.writeFileSync(FILE, JSON.stringify(state)); } catch {}
  // also keep a copy on GitHub so it survives deploys (best-effort)
  store.putJSON('rankings.json', state, 'Update ICC rankings snapshot').catch((e) => console.warn('rankings backup failed:', e.message));
};

// At startup, if the disk is empty (fresh deploy), pull the last snapshot back from GitHub
export async function hydrate(players) {
  if (state.updatedAt || !store.enabled()) return false;
  try {
    const s = await store.getJSON('rankings.json');
    if (s && s.rankings && s.updatedAt) { state = s; applyRankings(players, state.rankings, false); return true; }
  } catch (e) { console.warn('rankings restore failed:', e.message); }
  return false;
}

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

let probe = [];
function findFeeds(html, base) {
  const out = new Set();
  for (const m of String(html).matchAll(/(?:https?:)?\/\/[^"'\s<>()]+|\/[A-Za-z0-9_\-\/.]*rank[^"'\s<>()]*/gi)) {
    const u = m[0]; if (/rank|sportz|feed|api/i.test(u) && !/\.(png|jpe?g|svg|webp|css|woff2?)(\?|$)/i.test(u)) out.add(u.startsWith('/') && !u.startsWith('//') ? new URL(u, base).href : u);
  }
  return [...out].slice(0, 25);
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
    for (const c of CATS) rankings[c] = parseRankings(manual[c], { pasted: true });
  } else {
    const u = urls();
    for (const c of CATS) {
      const tried = [];
      for (const url of u[c]) {
        try {
          const html = await fetchText(url);
          const rows = parseRankings(html);
          if (rows.length >= 5) { rankings[c] = rows; break; }
          tried.push('page loaded but no ranking data in it');
          if (c === 'batting') probe = [...sampleData(html), ...findFeeds(html, url).filter((u) => !/icc-cricket\.com\/rankings/.test(u))];
        } catch (e) { tried.push(e.message); }
      }
      if (!rankings[c].length) errors.push(`${c}: ${[...new Set(tried)].join(', ')}`);
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
  probe,
  top: Object.fromEntries(CATS.map((c) => [c, (state.rankings[c] || []).slice(0, 5).map((x) => `${x.rank}. ${x.name}`)])),
});
