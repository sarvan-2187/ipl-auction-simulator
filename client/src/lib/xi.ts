// Playing XI logic (mirrors server/xi.js) + suggestions
import { getPlayer, ratingAs } from './data';
import type { Player, Role } from './types';

export const XI_SIZE = 11;
export const MAX_OS = 4;
export const MIN_BOWLING = 5;
type Entry = { id: number; role?: Role };

export const roleIn = (squad: Entry[], id: number): Role => squad.find((e) => e.id === id)?.role || getPlayer(id).role;

export function xiInfo(ids: number[], squad: Entry[]) {
  const ps = ids.map((id) => ({ p: getPlayer(id), role: roleIn(squad, id) }));
  const counts: Record<Role, number> = { BAT: 0, BOWL: 0, AR: 0, WK: 0 };
  for (const x of ps) counts[x.role]++;
  const os = ps.filter((x) => x.p.overseas).length;
  const avg = ps.length ? ps.reduce((s, x) => s + ratingAs(x.p, x.role), 0) / XI_SIZE : 0;
  const issues: string[] = [];
  let penalty = 0;
  if (!counts.WK) { issues.push('No wicket-keeper'); penalty += 2; }
  const bowling = counts.BOWL + counts.AR;
  if (bowling < MIN_BOWLING) { issues.push(`Only ${bowling} bowling option${bowling === 1 ? '' : 's'} (need ${MIN_BOWLING})`); penalty += MIN_BOWLING - bowling; }
  if (os > MAX_OS) issues.push(`${os} overseas (max ${MAX_OS})`);
  const need = Math.min(XI_SIZE, squad.length) - ps.length;
  if (need > 0) issues.push(`${need} more to pick`);
  const rating = Math.max(0, Math.round((avg - penalty) * 10) / 10);
  return { rating, counts, os, bowling, issues, complete: need <= 0, legal: need <= 0 && os <= MAX_OS };
}

export function autoXI(squad: Entry[]) {
  const pool = squad.map((e) => { const p = getPlayer(e.id); const role = e.role || p.role; return { id: e.id, p, role, r: ratingAs(p, role) }; })
    .sort((a, b) => b.r - a.r);
  let best: { ids: number[]; rating: number } | null = null;
  for (const bowlTarget of [5, 6]) {
    const xi: typeof pool = []; let os = 0;
    const take = (x: (typeof pool)[number]) => { if (xi.includes(x) || xi.length >= XI_SIZE || (x.p.overseas && os >= MAX_OS)) return false; if (x.p.overseas) os++; xi.push(x); return true; };
    pool.filter((x) => x.role === 'WK').slice(0, 1).forEach(take);
    let b = 0;
    for (const x of pool) if (b < bowlTarget && (x.role === 'BOWL' || x.role === 'AR') && take(x)) b++;
    for (const x of pool) take(x);
    const ids = xi.map((x) => x.id);
    const rating = xiInfo(ids, squad).rating;
    if (!best || rating > best.rating) best = { ids, rating };
  }
  return best ? best.ids : [];
}

export type Suggestion = { text: string; delta: number; apply: number[] };

// Best single changes that raise the XI rating (or fill empty spots)
export function suggestions(ids: number[], squad: Entry[]): Suggestion[] {
  const base = xiInfo(ids, squad).rating;
  const bench = squad.map((e) => e.id).filter((id) => !ids.includes(id));
  const name = (p: Player) => p.name.split(' ').slice(-1)[0];
  const out: Suggestion[] = [];
  if (ids.length < Math.min(XI_SIZE, squad.length)) {
    for (const id of bench) {
      const next = [...ids, id];
      const info = xiInfo(next, squad);
      if (info.os > MAX_OS) continue;
      out.push({ text: `Add ${name(getPlayer(id))} (${roleIn(squad, id)} ${ratingAs(getPlayer(id), roleIn(squad, id))})`, delta: info.rating - base, apply: next });
    }
  } else {
    for (const outId of ids) for (const inId of bench) {
      const next = ids.map((x) => (x === outId ? inId : x));
      const info = xiInfo(next, squad);
      if (info.os > MAX_OS) continue;
      const d = info.rating - base;
      if (d > 0.05) out.push({ text: `Bring in ${name(getPlayer(inId))} for ${name(getPlayer(outId))}`, delta: d, apply: next });
    }
  }
  out.sort((a, b) => b.delta - a.delta);
  // one suggestion per incoming player
  const seen = new Set<string>();
  return out.filter((s) => { const k = s.text.split(' for ')[0]; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 3);
}
