// Playing XI: rating, validation, auto-pick and suggestions. Mirrored in client/src/lib/xi.ts.
export const XI_SIZE = 11;
export const MAX_OS = 4;
export const MIN_BOWLING = 5; // bowlers + all-rounders

const ratingAs = (p, role) => (p.ratings && p.ratings[role] != null ? p.ratings[role] : p.rating);

// entries: [{ id, role }] from a squad; byId: Map(id -> player)
export function xiInfo(ids, squad, byId) {
  const roleOf = new Map(squad.map((e) => [e.id, e.role || byId.get(e.id)?.role]));
  const ps = ids.map((id) => ({ p: byId.get(id), role: roleOf.get(id) })).filter((x) => x.p);
  const c = { BAT: 0, BOWL: 0, AR: 0, WK: 0 };
  for (const x of ps) c[x.role]++;
  const os = ps.filter((x) => x.p.overseas).length;
  const avg = ps.length ? ps.reduce((s, x) => s + ratingAs(x.p, x.role), 0) / XI_SIZE : 0;
  const issues = [];
  let penalty = 0;
  if (!c.WK) { issues.push('No wicket-keeper'); penalty += 2; }
  const bowling = c.BOWL + c.AR;
  if (bowling < MIN_BOWLING) { issues.push(`Only ${bowling} bowling option${bowling === 1 ? '' : 's'} (need ${MIN_BOWLING})`); penalty += MIN_BOWLING - bowling; }
  if (os > MAX_OS) issues.push(`${os} overseas (max ${MAX_OS})`);
  if (ps.length < XI_SIZE) issues.push(`${XI_SIZE - ps.length} more to pick`);
  const rating = Math.max(0, Math.round((avg - penalty) * 10) / 10);
  return { rating, counts: c, os, issues, legal: ps.length === Math.min(XI_SIZE, squad.length) && os <= MAX_OS };
}

export function autoXI(squad, byId) {
  const pool = squad.map((e) => ({ id: e.id, p: byId.get(e.id), role: e.role || byId.get(e.id)?.role })).filter((x) => x.p)
    .map((x) => ({ ...x, r: ratingAs(x.p, x.role) })).sort((a, b) => b.r - a.r);
  let best = null;
  for (const bowlTarget of [5, 6]) {
    const xi = []; let os = 0;
    const take = (x) => { if (xi.includes(x) || xi.length >= XI_SIZE || (x.p.overseas && os >= MAX_OS)) return false; if (x.p.overseas) os++; xi.push(x); return true; };
    pool.filter((x) => x.role === 'WK').slice(0, 1).forEach(take);
    let b = 0;
    for (const x of pool) if (b < bowlTarget && (x.role === 'BOWL' || x.role === 'AR') && take(x)) b++;
    for (const x of pool) take(x);
    const ids = xi.map((x) => x.id);
    const info = xiInfo(ids, squad, byId);
    if (!best || info.rating > best.info.rating) best = { ids, info };
  }
  return best ? best.ids : [];
}
