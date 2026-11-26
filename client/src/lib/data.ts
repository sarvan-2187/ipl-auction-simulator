import type { Player, TeamInfo, Role } from './types';

let players: Player[] = [];
let byId = new Map<number, Player>();
let teams: TeamInfo[] = [];
let teamByCode = new Map<string, TeamInfo>();

export async function loadData() {
  const [p, t] = await Promise.all([
    fetch('/data/players.json').then((r) => r.json()),
    fetch('/data/teams.json').then((r) => r.json()),
  ]);
  players = p;
  byId = new Map(players.map((x) => [x.id, x]));
  teams = t;
  teamByCode = new Map(teams.map((x) => [x.code, x]));
}

export const getPlayer = (id: number) => byId.get(id)!;
export const allPlayers = () => players;
export const allTeams = () => teams;
export const getTeam = (code: string | null | undefined) => (code ? teamByCode.get(code) : undefined);

export const teamLogo = (code: string) => `/teams/${code}.svg`;
export const teamPattern = (code: string) => `/teams/${code}-bg.svg`;
export const playerPhoto = (p: Player) => (p.photo === 'cut' ? `/players/${p.id}.webp` : p.photo === 'wiki' ? `/players/${p.id}.jpg` : null);

export const ROLE_LABEL: Record<Role, string> = { BAT: 'Batter', BOWL: 'Bowler', AR: 'All-Rounder', WK: 'Wicket-Keeper' };
export const ROLE_SHORT: Record<Role, string> = { BAT: 'BAT', BOWL: 'BOWL', AR: 'AR', WK: 'WK' };


export function money(lakhs: number | null | undefined, opts: { short?: boolean } = {}) {
  if (lakhs == null) return '—';
  if (lakhs < 100) return `₹${lakhs} L`;
  const cr = lakhs / 100;
  const s = cr % 1 === 0 ? cr.toFixed(0) : cr.toFixed(2).replace(/0$/, '');
  return opts.short ? `₹${s}Cr` : `₹${s} Cr`;
}

export function increment(bid: number) {
  if (bid < 100) return 5;
  if (bid < 200) return 10;
  if (bid < 500) return 20;
  if (bid < 1000) return 25;
  return 50;
}

// Team strength: average rating of best XI (max 4 overseas) – a fun post-auction score
export const ROLES: Role[] = ['BAT', 'BOWL', 'AR', 'WK'];
const ROLE_FILL_ORDER: Role[] = ['WK', 'BOWL', 'AR', 'BAT'];
type SquadEntry = { id: number; role?: Role };

export const ratingAs = (p: Player, role: Role) => (p.ratings?.[role] ?? p.rating);
export const roleOf = (e: SquadEntry) => e.role || getPlayer(e.id).role;

export function roleCounts(squad: SquadEntry[]) {
  const c: Record<Role, number> = { BAT: 0, BOWL: 0, AR: 0, WK: 0 };
  for (const e of squad) c[roleOf(e)]++;
  return c;
}
const NO_ROLES: Record<Role, number> = { BAT: 0, BOWL: 0, AR: 0, WK: 0 };
// Role minimums that apply: none when the host switched squad rules off
export const ruleMin = (s: { roleRules?: boolean; roleMin?: Record<Role, number> }) => (s.roleRules === false ? NO_ROLES : s.roleMin || NO_ROLES);

export function unmet(counts: Record<Role, number>, roleMin: Partial<Record<Role, number>> | undefined) {
  const out: Partial<Record<Role, number>> = {};
  for (const r of ROLES) { const n = Math.max(0, (roleMin?.[r] || 0) - counts[r]); if (n) out[r] = n; }
  return out;
}
export function bestRoleFor(squad: SquadEntry[], p: Player, roleMin: Partial<Record<Role, number>> | undefined): Role {
  const need = unmet(roleCounts(squad), roleMin);
  return ROLE_FILL_ORDER.find((r) => need[r] && (p.roles || [p.role]).includes(r)) || p.role;
}

// Team strength: average rating of a best XI picked by role (1 keeper, 4 bowling options, max 4 overseas),
// using each player's rating in the role his owner assigned
export function teamStrength(squad: SquadEntry[]) {
  const pool = squad.map((e) => { const p = getPlayer(e.id); const role = roleOf(e); return { p, role, r: ratingAs(p, role) }; })
    .sort((a, b) => b.r - a.r);
  const xi: typeof pool = [];
  let os = 0;
  const take = (x: (typeof pool)[number]) => { if (xi.includes(x) || xi.length >= 11 || (x.p.overseas && os >= 4)) return false; if (x.p.overseas) os++; xi.push(x); return true; };
  pool.filter((x) => x.role === 'WK').slice(0, 1).forEach(take);
  let bowlers = 0;
  for (const x of pool) if (bowlers < 4 && (x.role === 'BOWL' || x.role === 'AR') && take(x)) bowlers++;
  for (const x of pool) take(x);
  const score = xi.length ? Math.round(xi.reduce((s, x) => s + x.r, 0) / 11) : 0;
  return { score, xi };
}
