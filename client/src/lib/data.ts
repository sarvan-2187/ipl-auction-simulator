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

export function flagEmoji(cc: string) {
  if (cc === 'gb-eng') return '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}';
  if (cc === 'wi') return '🌴';
  if (!cc || cc.length !== 2) return '🏳️';
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

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
export function teamStrength(ids: number[]) {
  const ps = ids.map(getPlayer).sort((a, b) => b.rating - a.rating);
  const xi: Player[] = [];
  let os = 0;
  for (const p of ps) {
    if (xi.length === 11) break;
    if (p.overseas && os >= 4) continue;
    if (p.overseas) os++;
    xi.push(p);
  }
  if (!xi.length) return { score: 0, xi };
  const score = Math.round(xi.reduce((s, p) => s + p.rating, 0) / 11);
  return { score, xi };
}
