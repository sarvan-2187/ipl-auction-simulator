// Auction engine. Pure state + rules; socket wiring lives in index.js.
// All money values are in lakhs (100 lakhs = 1 crore).
import { readFileSync } from 'node:fs';
import { autoXI, xiInfo, XI_SIZE, MAX_OS } from './xi.js';

export const PLAYERS = JSON.parse(readFileSync(new URL('./players.json', import.meta.url), 'utf8'));
export const PLAYER_BY_ID = new Map(PLAYERS.map((p) => [p.id, p]));
export const TEAM_CODES = ['CSK', 'MI', 'RCB', 'KKR', 'DC', 'PBKS', 'RR', 'SRH', 'GT', 'LSG'];

export const DEFAULT_SETTINGS = {
  purse: 12000, // 120 Cr
  maxSquad: 20,
  minSquad: 15,
  maxOverseas: 8,
  bidTime: 7, // seconds the clock resets to after each bid
  pool: 'quick', // quick | standard | full
  unsoldRound: true,
  cpuLevel: 'medium', // computer players: easy | medium | hard
  roleMin: { BAT: 3, BOWL: 4, AR: 2, WK: 2 }, // squad rules
  trading: true, // owners can swap players and cash after the auction
};
export const MAX_OPEN_TRADES = 3; // pending offers each team can have out at once
export const ROLES = ['BAT', 'BOWL', 'AR', 'WK'];
export const MAX_SPECTATORS = 10;
export const REACTIONS = ['fire', 'clap', 'scream', 'joy', 'money', 'mindblown', 'skull', 'pray'];
// How computer players behave at each difficulty
export const CPU_LEVELS = {
  // easy: drop out early, often let humans have players cheaply, slow to react, rarely jump-bid
  easy: { value: 0.62, vsHuman: 0.7, letGo: 0.35, jump: 0.25, delay: [700, 1600], spend: 0.8 },
  medium: { value: 1, vsHuman: 1, letGo: 0, jump: 0.7, delay: [300, 1000], spend: 1 },
  // hard: pay up, contest humans, react fast and jump-bid aggressively
  hard: { value: 1.6, vsHuman: 1.25, letGo: 0, jump: 0.9, delay: [220, 750], spend: 1.45, pace: true },
};
const ROLE_FILL_ORDER = ['WK', 'BOWL', 'AR', 'BAT']; // scarce roles first when auto-assigning

const rolesOf = (p) => (p.roles && p.roles.length ? p.roles : [p.role]);
export const ratingAs = (p, role) => (p.ratings && p.ratings[role] != null ? p.ratings[role] : p.rating);

export function roleCounts(squad) {
  const c = { BAT: 0, BOWL: 0, AR: 0, WK: 0 };
  for (const x of squad) c[x.role || PLAYER_BY_ID.get(x.id)?.role || 'BAT']++;
  return c;
}
export function unmet(counts, roleMin) {
  const out = {};
  for (const r of ROLES) { const n = Math.max(0, (roleMin?.[r] || 0) - counts[r]); if (n) out[r] = n; }
  return out;
}
// Which role a newly bought player takes: an unmet requirement he can fill, else his main role
export function bestRoleFor(squad, p, roleMin) {
  const need = unmet(roleCounts(squad), roleMin);
  return ROLE_FILL_ORDER.find((r) => need[r] && rolesOf(p).includes(r)) || p.role;
}
export const POOL_SIZES = { blitz: 60, quick: 120, standard: 220, full: Infinity };
const MIN_BASE = 30;
const SOLD_PAUSE_MS = 4800; // time for the gavel + ticket + stamp ceremony
const UNSOLD_PAUSE_MS = 2600;
const BOT_NAMES = 'ABCDEFGHIJ'.split('').map((l) => `Computer ${l}`);

export const lakhsText = (l) => (l < 100 ? `₹${l} L` : `₹${+(l / 100).toFixed(2)} Cr`);

export function increment(bid) {
  if (bid < 100) return 5;
  if (bid < 200) return 10;
  if (bid < 500) return 20;
  if (bid < 1000) return 25;
  return 50; // above ₹10 Cr the steps get bigger so star wars don't drag
}

// Deterministic per-room randomness so bots/sets don't need extra state
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const ROLE_SET = { BAT: 'Batters', AR: 'All-Rounders', WK: 'Wicket-Keepers', BOWL: 'Bowlers' };

// Builds the lot order the way the real auction runs: marquee sets first, then
// capped role sets interleaved, then uncapped role sets.
export function buildQueue(settings, numTeams, seed) {
  const rnd = mulberry32(seed);
  const want = Math.min(PLAYERS.length, Math.max(POOL_SIZES[settings.pool] ?? 120, numTeams * (settings.minSquad + 5)));
  // ~72% capped / ~28% uncapped. Within each, the best 70% by rating plus a random mix of the rest
  const pick = (list, n) => {
    const sorted = [...list].sort((a, b) => b.rating - a.rating);
    const top = Math.round(n * 0.7);
    return [...sorted.slice(0, top), ...shuffle(sorted.slice(top), rnd).slice(0, n - top)];
  };
  const capped = PLAYERS.filter((p) => p.capped);
  const uncapped = PLAYERS.filter((p) => !p.capped);
  const nUn = Math.min(uncapped.length, Math.round(want * 0.28));
  const pool = [...pick(capped, Math.min(capped.length, want - nUn)), ...pick(uncapped, nUn)];
  // Make sure every team can meet the squad rules: top up each role from the best players left out
  const inPool = new Set(pool.map((p) => p.id));
  const roleMin = settings.roleMin || DEFAULT_SETTINGS.roleMin;
  for (const r of ROLES) {
    const want = numTeams * ((roleMin[r] || 0) + 1);
    let have = pool.filter((p) => p.role === r).length;
    for (const p of [...PLAYERS].filter((x) => x.role === r && !inPool.has(x.id)).sort((a, b) => b.rating - a.rating)) {
      if (have >= want) break;
      pool.push(p); inPool.add(p.id); have++;
    }
  }
  const sets = [];
  const marquee = shuffle(pool.filter((p) => p.marquee), rnd);
  for (let i = 0; i < marquee.length; i += 10) sets.push({ name: `Marquee Set ${i / 10 + 1}`, ids: marquee.slice(i, i + 10) });
  for (const capped of [true, false]) {
    const rest = pool.filter((p) => !p.marquee && p.capped === capped);
    const byRole = Object.keys(ROLE_SET).map((r) => rest.filter((p) => p.role === r).sort((a, b) => b.rating - a.rating));
    const chunk = capped ? 8 : 10;
    const counters = {};
    for (let i = 0; byRole.some((l) => l.length > i * chunk); i++) {
      byRole.forEach((list, ri) => {
        const part = list.slice(i * chunk, (i + 1) * chunk);
        if (!part.length) return;
        const role = Object.keys(ROLE_SET)[ri];
        const key = `${capped}${role}`;
        counters[key] = (counters[key] || 0) + 1;
        sets.push({ name: `${capped ? '' : 'Uncapped '}${ROLE_SET[role]} ${counters[key]}`, ids: shuffle(part, rnd) });
      });
    }
  }
  const queue = [];
  for (const s of sets) for (const p of s.ids) queue.push({ id: p.id, set: s.name });
  return queue;
}

// Fair value used by bots (lakhs). rating 60 ≈ 1.3 Cr, 75 ≈ 3.8 Cr, 90 ≈ 11 Cr.
function fairValue(p) {
  return Math.max(p.base, Math.round(30 * Math.pow(1.075, p.rating - 40)));
}

export class Room {
  constructor(code, hostId, now = Date.now()) {
    this.code = code;
    this.hostId = hostId;
    this.createdAt = now;
    this.lastActive = now;
    this.settings = { ...DEFAULT_SETTINGS };
    this.members = new Map(); // id -> {id,name,team,connected,bot}
    this.teams = {}; // code -> {code, ownerId, purse, squad:[{id,price}]}
    this.phase = 'lobby';
    this.queue = [];
    this.idx = -1;
    this.round = 1;
    this.unsold = [];
    this.lot = null;
    this.paused = false;
    this.pausedRemaining = 0;
    this.log = [];
    this.chat = []; // last 60 messages
    this.trades = []; // post-auction trade offers
    this.seed = Math.floor(Math.random() * 2 ** 31);
    this.rnd = mulberry32(this.seed);
    this.version = 0;
    this.nextLotAt = 0;
    this.botPlans = {};
  }

  touch(now = Date.now()) { this.lastActive = now; this.version++; }

  addLog(entry) {
    this.log.push({ t: Date.now(), ...entry });
    if (this.log.length > 60) this.log.shift();
  }

  // ---------- lobby ----------
  join(memberId, name) {
    name = cleanName(name);
    const ex = this.members.get(memberId);
    if (ex) { ex.connected = true; if (name) ex.name = name; return ex; }
    // up to 10 spectators (people without a franchise), in addition to the 10 team owners
    if (this.spectators().length >= MAX_SPECTATORS) throw new Error(`Room is full: ${MAX_SPECTATORS} spectators already watching`);
    const m = { id: memberId, name: name || 'Player', team: null, connected: true, bot: false };
    this.members.set(memberId, m);
    return m;
  }

  humanCount() { return [...this.members.values()].filter((m) => !m.bot).length; }
  spectators() { return [...this.members.values()].filter((m) => !m.bot && !m.team); }

  // Host hands control to another person in the room (must be online, not a computer player)
  transferHost(byId, toId) {
    this.assertHost(byId);
    const to = this.members.get(toId);
    if (!to || to.bot) throw new Error('Pick a person in the room');
    if (!to.connected) throw new Error(`${to.name} is offline`);
    if (toId === byId) return;
    this.hostId = toId;
    this.addLog({ kind: 'info', text: `${to.name} is now the host` });
  }

  // Reactions: everyone may react, spectators mostly. Per-person and per-room limits stop floods.
  react(memberId, key, now = Date.now()) {
    const m = this.members.get(memberId);
    if (!m || m.bot) throw new Error('Not in room');
    if (!REACTIONS.includes(key)) throw new Error('Unknown reaction');
    m._reactTimes = (m._reactTimes || []).filter((t) => now - t < 10000);
    const last = m._reactTimes[m._reactTimes.length - 1];
    if ((last !== undefined && now - last < 1500) || m._reactTimes.length >= 4) throw new Error('Easy on the reactions');
    this._roomReacts = (this._roomReacts || []).filter((t) => now - t < 1000);
    if (this._roomReacts.length >= 6) throw new Error('Easy on the reactions');
    m._reactTimes.push(now); this._roomReacts.push(now);
    return { id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, key, name: m.name, team: m.team || null, spectator: !m.team };
  }

  pickTeam(memberId, code) {
    if (this.phase !== 'lobby') throw new Error('Auction already started');
    if (!TEAM_CODES.includes(code)) throw new Error('Unknown team');
    const m = this.members.get(memberId);
    if (!m) throw new Error('Not in room');
    const owner = [...this.members.values()].find((x) => x.team === code);
    if (owner && owner.id !== memberId) throw new Error(`${code} is taken by ${owner.name}`);
    m.team = code;
  }

  leaveTeam(memberId) {
    if (this.phase !== 'lobby') return;
    const m = this.members.get(memberId);
    if (m) m.team = null;
  }

  addBot(byId, code) {
    this.assertHost(byId);
    if (this.phase !== 'lobby') throw new Error('Auction already started');
    if (!TEAM_CODES.includes(code)) throw new Error('Unknown team');
    if ([...this.members.values()].some((x) => x.team === code)) throw new Error('Team already taken');
    const id = `bot-${code}`;
    const used = new Set([...this.members.values()].map((m) => m.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) || `Bot ${code}`;
    this.members.set(id, { id, name, team: code, connected: true, bot: true });
  }

  removeMember(byId, id) {
    this.assertHost(byId);
    const m = this.members.get(id);
    if (!m || id === this.hostId) return;
    if (this.phase === 'lobby') this.members.delete(id);
    else if (m.bot) throw new Error('Cannot remove a computer player mid-auction');
  }

  updateSettings(byId, patch) {
    this.assertHost(byId);
    if (this.phase !== 'lobby') throw new Error('Auction already started');
    const s = { ...this.settings };
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v))));
    if (patch.purse != null) s.purse = clamp(patch.purse, 2000, 30000);
    if (patch.maxSquad != null) s.maxSquad = clamp(patch.maxSquad, 11, 30);
    if (patch.minSquad != null) s.minSquad = clamp(patch.minSquad, 11, 30);
    if (patch.maxOverseas != null) s.maxOverseas = clamp(patch.maxOverseas, 0, 12);
    if (patch.bidTime != null) s.bidTime = clamp(patch.bidTime, 5, 30);
    if (patch.pool != null && POOL_SIZES[patch.pool] !== undefined) s.pool = patch.pool;
    if (patch.unsoldRound != null) s.unsoldRound = !!patch.unsoldRound;
    if (patch.trading != null) s.trading = !!patch.trading;
    if (patch.cpuLevel != null && CPU_LEVELS[patch.cpuLevel]) s.cpuLevel = patch.cpuLevel;
    if (patch.roleMin && typeof patch.roleMin === 'object') {
      const rm = { ...s.roleMin };
      for (const r of ROLES) if (patch.roleMin[r] != null) rm[r] = clamp(patch.roleMin[r], 0, 8);
      s.roleMin = rm;
    }
    // squad rules can never exceed the squad size
    const sum = () => ROLES.reduce((a, r) => a + s.roleMin[r], 0);
    while (sum() > s.maxSquad) { const r = ROLES.reduce((a, b) => (s.roleMin[a] >= s.roleMin[b] ? a : b)); s.roleMin = { ...s.roleMin, [r]: s.roleMin[r] - 1 }; }
    if (s.minSquad > s.maxSquad) s.minSquad = s.maxSquad;
    this.settings = s;
  }

  // Owners can move a bought player between the roles he's eligible for; his rating follows the role
  setRole(memberId, playerId, role) {
    const m = this.members.get(memberId);
    const team = m && this.teams[m.team];
    if (!team) throw new Error('You have no squad');
    const entry = team.squad.find((x) => x.id === Number(playerId));
    if (!entry) throw new Error('Not in your squad');
    const p = PLAYER_BY_ID.get(entry.id);
    if (!rolesOf(p).includes(role)) throw new Error(`${p.name} can't play as ${role}`);
    entry.role = role;
  }

  // Text chat inside the room
  addChat(memberId, text, now = Date.now()) {
    const m = this.members.get(memberId);
    if (!m) throw new Error('Not in room');
    const clean = String(text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!clean) throw new Error('Message is empty');
    m._chatTimes = (m._chatTimes || []).filter((t) => now - t < 10000);
    if (m._chatTimes.length >= 6) throw new Error('Slow down a little');
    m._chatTimes.push(now);
    const msg = { id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, t: now, from: memberId, name: m.name, team: m.team || null, text: clean };
    this.chat.push(msg);
    if (this.chat.length > 60) this.chat.shift();
    return msg;
  }

  assertHost(id) { if (id !== this.hostId) throw new Error('Only the host can do that'); }

  // ---------- auction ----------
  start(byId, now = Date.now()) {
    this.assertHost(byId);
    if (this.phase !== 'lobby') throw new Error('Already started');
    const owners = [...this.members.values()].filter((m) => m.team);
    if (owners.length < 2) throw new Error('Need at least 2 teams (add a computer player or invite a friend)');
    for (const m of [...this.members.values()]) if (!m.team && !m.bot) m.team = null; // spectators allowed
    this.teams = {};
    for (const m of owners) this.teams[m.team] = { code: m.team, ownerId: m.id, purse: this.settings.purse, squad: [] };
    this.queue = buildQueue(this.settings, owners.length, this.seed);
    this.phase = 'auction';
    this.idx = -1;
    this.addLog({ kind: 'info', text: `Auction started · ${this.queue.length} players · ${owners.length} teams` });
    this.nextLotAt = now + 2500;
    this.lot = null;
  }

  activeTeams() { return Object.values(this.teams); }

  overseasCount(team) { return team.squad.filter((s) => PLAYER_BY_ID.get(s.id)?.overseas).length; }

  // Why a team can't bid `amount` on the current lot (null = allowed)
  bidBlocker(team, amount) {
    const p = PLAYER_BY_ID.get(this.lot.id);
    const s = this.settings;
    if (team.squad.length >= s.maxSquad) return 'Squad full';
    if (p.overseas && this.overseasCount(team) >= s.maxOverseas) return 'Overseas limit reached';
    // Squad rules: after this buy, the open slots must still cover every unmet role minimum
    const role = bestRoleFor(team.squad, p, s.roleMin);
    const after = roleCounts(team.squad); after[role]++;
    const need = unmet(after, s.roleMin);
    const needTotal = Object.values(need).reduce((a, b) => a + b, 0);
    const slotsLeft = s.maxSquad - team.squad.length - 1;
    const needList = Object.entries(need).map(([r, n]) => `${n} ${r}`).join(', ');
    if (needTotal > slotsLeft) return `Need ${needList}: only ${slotsLeft + 1} slots left`;
    const minPlayers = Math.max(0, s.minSquad - team.squad.length - 1);
    const mustBuy = Math.max(minPlayers, needTotal);
    if (team.purse - amount < mustBuy * MIN_BASE) {
      const lakhs = mustBuy * MIN_BASE;
      const amt = lakhs < 100 ? `₹${lakhs} L` : `₹${+(lakhs / 100).toFixed(2)} Cr`;
      return `Not enough purse: keep ${amt} ${needTotal >= minPlayers && needTotal ? `for ${needList}` : `for ${mustBuy} more players`}`;
    }
    return null;
  }

  nextBidAmount() {
    if (!this.lot) return null;
    return this.lot.bid == null ? this.lot.base : this.lot.bid + increment(this.lot.bid);
  }

  openNextLot(now = Date.now()) {
    const teams = this.activeTeams();
    const allFull = teams.every((t) => t.squad.length >= this.settings.maxSquad);
    this.idx++;
    if (this.idx >= this.queue.length || allFull) {
      if (!allFull && this.round === 1 && this.settings.unsoldRound && this.unsold.length) {
        this.round = 2;
        this.queue = this.unsold.map((id) => ({ id, set: 'Accelerated Round' }));
        this.unsold = [];
        this.idx = 0;
        this.addLog({ kind: 'info', text: `Accelerated round: ${this.queue.length} unsold players return` });
      } else {
        return this.finish();
      }
    }
    const q = this.queue[this.idx];
    const p = PLAYER_BY_ID.get(q.id);
    this.lot = {
      id: q.id, set: q.set, base: p.base, bid: null, leader: null,
      endsAt: now + (this.settings.bidTime + 3) * 1000, // a little longer for the opening bid
      history: [], status: 'live', passed: this.activeTeams().filter((t) => t.doneBuying).map((t) => t.code), n: this.idx + 1,
    };
    this.botPlans = {};
  }

  // `seen` (the bid the client was looking at) is accepted for compatibility; stale amounts are handled below.
  // `amount` may be a jump bid above the next increment.
  placeBid(memberId, amount, now = Date.now(), seen) {
    if (this.phase !== 'auction' || !this.lot || this.lot.status !== 'live') throw new Error('No live lot');
    if (this.paused) throw new Error('Auction is paused');
    const m = this.members.get(memberId);
    const team = m && this.teams[m.team];
    if (!team) throw new Error('You are spectating');
    if (this.lot.leader === team.code) throw new Error('You are already the highest bidder');
    if (team.doneBuying) throw new Error("You've finished buying");
    if (this.lot.passed.includes(team.code)) throw new Error('You passed on this player');
    const expected = this.nextBidAmount();
    if (!Number.isFinite(amount) || amount <= 0 || amount % 5 !== 0) throw new Error('Invalid bid amount');
    if (amount < expected) {
      // A rival's bid landed while ours was in flight. A paddle raise means "the next bid",
      // so follow them by one step; only refuse if the price ran further than that.
      if (expected - amount > increment(amount)) throw new Error(`Price moved to ${lakhsText(expected)}, bid again`);
      amount = expected;
    }
    if (amount > expected + 500) throw new Error('Jump bids are limited to +5 Cr');
    const block = this.bidBlocker(team, amount);
    if (block) throw new Error(block);
    this.lot.bid = amount;
    this.lot.leader = team.code;
    this.lot.history.push({ team: team.code, amount, t: now });
    this.lot.endsAt = now + this.settings.bidTime * 1000;
    this.botPlans = {};
  }

  pass(memberId, now = Date.now()) {
    if (!this.lot || this.lot.status !== 'live') return;
    const m = this.members.get(memberId);
    const team = m && this.teams[m.team];
    if (!team || this.lot.leader === team.code) return;
    if (!this.lot.passed.includes(team.code)) this.lot.passed.push(team.code);
    this.checkAllPassed(now);
  }

  // Everyone who could still bid has passed → close early (short grace so it doesn't feel abrupt)
  checkAllPassed(now) {
    const lot = this.lot;
    const contenders = this.activeTeams().filter((t) => t.code !== lot.leader && !this.bidBlocker(t, this.nextBidAmount()));
    if (contenders.every((t) => lot.passed.includes(t.code))) lot.endsAt = Math.min(lot.endsAt, now + (lot.leader ? 1500 : 1200));
  }

  hammer(now = Date.now()) {
    const lot = this.lot;
    if (!lot || lot.status !== 'live') return;
    const p = PLAYER_BY_ID.get(lot.id);
    if (lot.leader) {
      const team = this.teams[lot.leader];
      team.purse -= lot.bid;
      team.squad.push({ id: lot.id, price: lot.bid, role: bestRoleFor(team.squad, p, this.settings.roleMin) });
      lot.status = 'sold';
      this.addLog({ kind: 'sold', id: lot.id, team: team.code, amount: lot.bid, text: `${p.name} SOLD to ${team.code}` });
    } else {
      lot.status = 'unsold';
      if (this.round === 1) this.unsold.push(lot.id);
      this.addLog({ kind: 'unsold', id: lot.id, text: `${p.name} unsold` });
    }
    lot.closedAt = now;
    this.nextLotAt = now + (lot.status === 'sold' ? SOLD_PAUSE_MS : UNSOLD_PAUSE_MS);
  }

  hostAction(byId, action, now = Date.now()) {
    this.assertHost(byId);
    if (this.phase !== 'auction') return;
    if (action === 'pause' && !this.paused) {
      this.paused = true;
      this.pausedRemaining = this.lot?.status === 'live' ? Math.max(1000, this.lot.endsAt - now) : 0;
    } else if (action === 'resume' && this.paused) {
      this.paused = false;
      if (this.lot?.status === 'live') this.lot.endsAt = now + this.pausedRemaining;
      else this.nextLotAt = now + 1000;
    } else if (action === 'end') {
      if (this.lot?.status === 'live') this.hammer(now);
      this.finish();
    }
  }

  // Same room, same people and franchise picks; fresh purses, new random sets
  rematch(byId, now = Date.now()) {
    this.assertHost(byId);
    if (this.phase !== 'results') throw new Error('Finish this auction first');
    this.phase = 'lobby';
    this.teams = {};
    this.queue = [];
    this.idx = -1;
    this.round = 1;
    this.unsold = [];
    this.lot = null;
    this.paused = false;
    this.log = [];
    this.trades = [];
    this.seed = Math.floor(Math.random() * 2 ** 31);
    this.rnd = mulberry32(this.seed);
    this.botPlans = {};
    for (const [id, m] of this.members) if (!m.connected && !m.bot && id !== this.hostId) this.members.delete(id);
    this.lastActive = now;
  }

  // Playing XI: owners pick 11 from their squad after the auction
  setXI(memberId, ids, lock = false) {
    if (this.phase !== 'results') throw new Error('Pick your XI once the auction is over');
    const m = this.members.get(memberId);
    const team = m && this.teams[m.team];
    if (!team) throw new Error('You have no squad');
    const own = new Set(team.squad.map((x) => x.id));
    const clean = [...new Set((ids || []).map(Number))].filter((id) => own.has(id));
    if (clean.length > XI_SIZE) throw new Error(`Pick only ${XI_SIZE}`);
    const info = xiInfo(clean, team.squad, PLAYER_BY_ID);
    if (info.os > MAX_OS) throw new Error(`Max ${MAX_OS} overseas in the XI`);
    if (lock && clean.length < Math.min(XI_SIZE, team.squad.length)) throw new Error(`Pick ${Math.min(XI_SIZE, team.squad.length)} players to lock`);
    team.xi = clean;
    team.xiLocked = !!lock;
  }

  // Test-only: give every team a legal 18-man squad, then end the auction
  devFillAndFinish() {
    const taken = new Set();
    const order = [...PLAYERS].sort((a, b) => b.rating - a.rating);
    const want = { WK: 3, BAT: 6, AR: 3, BOWL: 6 };
    const teams = this.activeTeams();
    for (const [role, n] of Object.entries(want)) {
      for (let k = 0; k < n; k++) for (const t of teams) {
        const os = this.overseasCount(t);
        const p = order.find((x) => !taken.has(x.id) && x.role === role && (!x.overseas || os < this.settings.maxOverseas));
        if (!p) continue;
        taken.add(p.id);
        t.squad.push({ id: p.id, price: p.base, role });
        t.purse -= p.base;
      }
    }
    this.finish();
  }

  // Test-only: each person's team gets a legal minimum squad from players outside the pool
  devFillHumans() {
    const inPool = new Set(this.queue.map((q) => q.id));
    const used = new Set(this.activeTeams().flatMap((t) => t.squad.map((x) => x.id)));
    const { minSquad, roleMin } = this.settings;
    for (const t of this.humanTeams()) {
      const plan = { ...roleMin };
      plan.BAT += Math.max(0, minSquad - t.squad.length - Object.values(roleMin).reduce((a, b) => a + b, 0));
      for (const [role, n] of Object.entries(plan)) {
        for (const p of PLAYERS.filter((x) => x.role === role && !x.overseas && !inPool.has(x.id) && !used.has(x.id)).slice(0, n)) {
          used.add(p.id); t.squad.push({ id: p.id, price: 30, role }); t.purse -= 30;
        }
      }
    }
  }

  finish() {
    // computer teams lock their best XI straight away
    for (const t of Object.values(this.teams)) {
      const m = this.members.get(t.ownerId);
      t.xi = m?.bot ? autoXI(t.squad, PLAYER_BY_ID) : t.xi || null;
      t.xiLocked = !!m?.bot;
    }
    this.phase = 'results';
    this.lot = null;
    this.paused = false;
    this.addLog({ kind: 'info', text: 'Auction complete' });
  }

  // ---------- finishing early ----------
  // A person's team is done when it's full, broke, or the owner tapped "Done buying"
  humanTeams() { return this.activeTeams().filter((t) => this.isHumanTeam(t.code)); }
  humansDone() {
    const humans = this.humanTeams();
    return humans.length > 0 && humans.every((t) => t.doneBuying || t.squad.length >= this.settings.maxSquad || t.purse < MIN_BASE);
  }

  // Owner is happy with the squad: stop bidding for the rest of the auction (squad rules must be met)
  doneBuying(memberId, now = Date.now()) {
    if (this.phase !== 'auction') throw new Error('No auction running');
    const m = this.members.get(memberId);
    const team = m && this.teams[m.team];
    if (!team) throw new Error('You are spectating');
    const s = this.settings;
    if (team.squad.length < s.minSquad) throw new Error(`Buy at least ${s.minSquad} players first`);
    const need = unmet(roleCounts(team.squad), s.roleMin);
    const list = Object.entries(need).map(([r, n]) => `${n} ${r}`).join(', ');
    if (list) throw new Error(`Squad rules still need ${list}`);
    if (this.lot?.status === 'live' && this.lot.leader === team.code) throw new Error('Wait until this lot closes, you hold the bid');
    team.doneBuying = true;
    if (this.lot?.status === 'live' && !this.lot.passed.includes(team.code)) { this.lot.passed.push(team.code); this.checkAllPassed(now); }
    this.addLog({ kind: 'info', text: `${team.code} finished buying` });
  }

  // Settle every remaining lot among the computer teams in one go, then end the auction.
  // Each lot goes up the bid ladder: the keenest computer that still wants the next price takes it.
  fastForward(now = Date.now()) {
    let lots = 0, sold = 0;
    for (let guard = 0; guard < 2000 && this.phase === 'auction'; guard++) {
      // the lot already on the block continues from its current bid
      if (!(guard === 0 && this.lot?.status === 'live')) this.openNextLot(now);
      if (this.phase !== 'auction') break;
      const lot = this.lot;
      const p = PLAYER_BY_ID.get(lot.id);
      const bots = this.activeTeams().filter((t) => !this.isHumanTeam(t.code));
      const want = new Map(bots.map((t) => [t.code, this.botValuation(t, p)]));
      for (let step = 0; step < 400; step++) {
        const next = this.nextBidAmount();
        const best = bots
          .filter((t) => t.code !== lot.leader && want.get(t.code) >= next && !this.bidBlocker(t, next))
          .sort((a, b) => want.get(b.code) - want.get(a.code))[0];
        if (!best) break;
        lot.bid = next; lot.leader = best.code;
        lot.history.push({ team: best.code, amount: next, t: now });
      }
      this.hammer(now);
      lots++;
      if (lot.status === 'sold') sold++;
    }
    this.nextLotAt = now;
    if (this.phase === 'auction') this.finish(); // guard tripped; never leave the room stuck
    if (lots) this.addLog({ kind: 'info', text: `Fast-forward: computers settled the last ${lots} players (${sold} sold)` });
    return { lots, sold };
  }

  // ---------- post-auction trading ----------
  // A trade: `from` gives `give` (+ cash if > 0) to `to` and receives `get` (+ |cash| if < 0).
  tradeTeams(memberId) {
    if (this.phase !== 'results') throw new Error('Trading opens after the auction');
    if (this.settings.trading === false) throw new Error('Trading is turned off in this room');
    const m = this.members.get(memberId);
    const team = m && this.teams[m.team];
    if (!team) throw new Error('You have no squad');
    return team;
  }

  // Squads and purses after the trade, or a reason it can't happen
  tradeProblem(tr) {
    const a = this.teams[tr.from], b = this.teams[tr.to];
    if (!a || !b) return 'That team is gone';
    const aIds = new Set(a.squad.map((x) => x.id)), bIds = new Set(b.squad.map((x) => x.id));
    if (!tr.give.every((id) => aIds.has(id))) return `${tr.from} no longer has every player in this deal`;
    if (!tr.get.every((id) => bIds.has(id))) return `${tr.to} no longer has every player in this deal`;
    const { maxSquad, maxOverseas, minSquad } = this.settings;
    const check = (t, out, inn, cashOut) => {
      const size = t.squad.length - out.length + inn.length;
      if (size > maxSquad) return `${t.code} would have ${size} players (max ${maxSquad})`;
      if (size < Math.min(minSquad, t.squad.length)) return `${t.code} would drop below ${Math.min(minSquad, t.squad.length)} players`;
      const os = t.squad.filter((x) => !out.includes(x.id) && PLAYER_BY_ID.get(x.id).overseas).length + inn.filter((id) => PLAYER_BY_ID.get(id).overseas).length;
      if (os > maxOverseas) return `${t.code} would have ${os} overseas players (max ${maxOverseas})`;
      if (t.purse - cashOut < 0) return `${t.code} can't afford ${lakhsText(cashOut)}`;
      return null;
    };
    return check(a, tr.give, tr.get, Math.max(0, tr.cash)) || check(b, tr.get, tr.give, Math.max(0, -tr.cash));
  }

  proposeTrade(memberId, { to, give, get, cash } = {}, now = Date.now()) {
    const from = this.tradeTeams(memberId);
    const other = this.teams[to];
    if (!other || other.code === from.code) throw new Error('Pick another team to trade with');
    const ids = (v) => [...new Set((Array.isArray(v) ? v : []).map(Number))].slice(0, 6);
    const tr = { id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, from: from.code, to: other.code, give: ids(give), get: ids(get), cash: Math.round(Number(cash) || 0), status: 'open', t: now, note: null };
    if (tr.cash % 5) throw new Error('Cash must be in steps of ₹5 L');
    if (!tr.give.length && !tr.get.length) throw new Error('Add at least one player');
    if (!tr.give.length && tr.cash <= 0) throw new Error("Offer a player or cash for what you're asking");
    if (!tr.get.length && tr.cash >= 0) throw new Error('Ask for a player or cash in return');
    const problem = this.tradeProblem(tr);
    if (problem) throw new Error(problem);
    const open = this.trades.filter((x) => x.status === 'open' && x.from === from.code);
    if (open.length >= MAX_OPEN_TRADES) throw new Error(`You already have ${MAX_OPEN_TRADES} offers waiting`);
    if (open.some((x) => x.to === tr.to && same(x.give, tr.give) && same(x.get, tr.get) && x.cash === tr.cash)) throw new Error('You already sent this offer');
    this.trades.push(tr);
    if (this.trades.length > 80) this.trades.splice(0, this.trades.length - 80);
    // computer teams answer straight away
    if (this.members.get(other.ownerId)?.bot) {
      if (this.botLikesTrade(tr)) this.applyTrade(tr, now);
      else { tr.status = 'rejected'; tr.note = 'Not enough value for us'; }
    }
    return { trade: tr };
  }

  respondTrade(memberId, id, accept, now = Date.now()) {
    const team = this.tradeTeams(memberId);
    const tr = this.trades.find((x) => x.id === id);
    if (!tr || tr.status !== 'open') throw new Error('This offer is no longer open');
    if (tr.to !== team.code) throw new Error('Only the other team can answer this offer');
    if (!accept) { tr.status = 'rejected'; return { trade: tr }; }
    this.applyTrade(tr, now);
    return { trade: tr };
  }

  cancelTrade(memberId, id) {
    const team = this.tradeTeams(memberId);
    const tr = this.trades.find((x) => x.id === id);
    if (!tr || tr.status !== 'open') throw new Error('This offer is no longer open');
    if (tr.from !== team.code) throw new Error('Only the team that sent it can cancel');
    tr.status = 'cancelled';
  }

  applyTrade(tr, now = Date.now()) {
    const problem = this.tradeProblem(tr);
    if (problem) { tr.status = 'failed'; tr.note = problem; throw new Error(problem); }
    const a = this.teams[tr.from], b = this.teams[tr.to];
    const move = (src, dst, ids) => {
      for (const id of ids) {
        const i = src.squad.findIndex((x) => x.id === id);
        const [entry] = src.squad.splice(i, 1);
        dst.squad.push({ id: entry.id, price: entry.price, role: bestRoleFor(dst.squad, PLAYER_BY_ID.get(id), this.settings.roleMin) });
      }
    };
    move(a, b, tr.give);
    move(b, a, tr.get);
    a.purse -= tr.cash; b.purse += tr.cash;
    for (const t of [a, b]) {
      const bot = this.members.get(t.ownerId)?.bot;
      if (bot) { t.xi = autoXI(t.squad, PLAYER_BY_ID); t.xiLocked = true; continue; }
      const own = new Set(t.squad.map((x) => x.id));
      // a player who left breaks the XI: drop him and unlock so the owner refills the slot
      if (t.xi && t.xi.some((id) => !own.has(id))) { t.xi = t.xi.filter((id) => own.has(id)); t.xiLocked = false; }
    }
    tr.status = 'accepted';
    tr.done = now;
    // other open offers that relied on these players are dead now
    const moved = new Set([...tr.give, ...tr.get]);
    for (const x of this.trades) {
      if (x === tr || x.status !== 'open') continue;
      if ([...x.give, ...x.get].some((id) => moved.has(id)) || this.tradeProblem(x)) { x.status = 'failed'; x.note = 'Squads changed after another trade'; }
    }
    const names = (ids) => ids.map((id) => PLAYER_BY_ID.get(id).name).join(', ');
    const part = (ids, cash) => [ids.length ? names(ids) : '', cash > 0 ? lakhsText(cash) : ''].filter(Boolean).join(' + ');
    this.addLog({ kind: 'info', text: `Trade: ${tr.from} sends ${part(tr.give, tr.cash) || 'nothing'} to ${tr.to} for ${part(tr.get, -tr.cash) || 'nothing'}` });
  }

  // Computer teams accept when the deal doesn't weaken their best XI more than the cash makes up for,
  // and they never sell for less than they paid (easy teams settle for a little less, hard want a premium)
  botLikesTrade(tr) {
    const bot = this.teams[tr.to], from = this.teams[tr.from];
    const level = this.settings.cpuLevel in CPU_LEVELS ? this.settings.cpuLevel : 'medium';
    const before = xiInfo(autoXI(bot.squad, PLAYER_BY_ID), bot.squad, PLAYER_BY_ID).rating;
    const after = bot.squad.filter((x) => !tr.get.includes(x.id)).concat(tr.give.map((id) => ({ id, price: 0 })));
    const afterRating = xiInfo(autoXI(after, PLAYER_BY_ID), after, PLAYER_BY_ID).rating;
    const edge = { easy: 0, medium: 0.2, hard: 0.5 }[level];
    if (afterRating - before + tr.cash / 500 < edge) return false; // ₹5 Cr ≈ one point of XI rating
    // a player is worth what was paid for him or his market value, whichever is higher
    const worth = (t, id) => Math.max(t.squad.find((x) => x.id === id)?.price || 0, marketValue(PLAYER_BY_ID.get(id)));
    const sum = (t, ids) => ids.reduce((a, id) => a + worth(t, id), 0);
    const factor = { easy: 0.85, medium: 1, hard: 1.25 }[level];
    return tr.cash + sum(from, tr.give) >= sum(bot, tr.get) * factor;
  }

  // Called ~4x/sec. Returns true when state changed and should be broadcast.
  tick(now = Date.now()) {
    if (this.phase !== 'auction' || this.paused) return false;
    if (!this.lot || this.lot.status !== 'live') {
      if (now < this.nextLotAt) return false;
      // every person is done buying: computers settle the rest instantly
      if (this.humansDone()) this.fastForward(now);
      else this.openNextLot(now);
      return true;
    }
    if (this.humansDone()) { this.fastForward(now); return true; }
    if (now >= this.lot.endsAt) { this.hammer(now); return true; }
    const before = this.lot.endsAt;
    const acted = this.botsAct(now);
    if (this.lot.status === 'live') this.checkAllPassed(now);
    return acted || this.lot.endsAt !== before;
  }

  // ---------- bots ----------
  botValuation(team, p) {
    const s = this.settings;
    const r = mulberry32(this.seed ^ (p.id * 31 + team.code.charCodeAt(0) * 7919 + team.code.length))();
    let v = fairValue(p) * (0.7 + r * 0.65);
    const counts = roleCounts(team.squad);
    const target = { BAT: 7, BOWL: 8, AR: 5, WK: 3 }[p.role];
    if (counts[p.role] >= target) v *= 0.55;
    // chase roles the squad rules still need
    const need = unmet(counts, s.roleMin);
    if (rolesOf(p).some((r) => need[r])) v *= this.round === 2 || this.queue.length - this.idx < 25 ? 1.8 : 1.3;
    const needed = Math.max(0, s.minSquad - team.squad.length);
    const left = this.queue.length - this.idx;
    if (needed > 0 && left < needed * 3) v *= 1.4;
    if (needed > 0 && this.round === 2) v = Math.max(v, p.base * 1.6);
    // Scale to purse so a 200 Cr room bids proportionally bigger than a 90 Cr room
    v *= s.purse / 12000;
    // Difficulty: how much computers are willing to pay, especially against human bidders
    const lvl = CPU_LEVELS[s.cpuLevel] || CPU_LEVELS.medium;
    v *= lvl.value;
    // hard computers pace their budget: keep enough for a strong squad rather than blowing it early
    if (lvl.pace) {
      const slotsLeft = Math.max(1, s.minSquad - team.squad.length);
      const perSlot = team.purse / slotsLeft;
      if (v > perSlot * 3.2) v = perSlot * 3.2 + (v - perSlot * 3.2) * 0.35;
    }
    if (this.lot && this.lot.history.some((h) => this.isHumanTeam(h.team))) v *= lvl.vsHuman;
    // Spend discipline: never commit more than a share of remaining purse to one player
    const neededSlots = Math.max(1, s.minSquad - team.squad.length);
    // how much of the remaining purse one player may take also scales with difficulty
    const cap = neededSlots <= 3 ? team.purse - (neededSlots - 1) * MIN_BASE : Math.min(team.purse * 0.3 * lvl.spend, (team.purse / neededSlots) * 3 * lvl.spend);
    const reserve = team.purse - Math.max(0, s.minSquad - team.squad.length - 1) * 50;
    return Math.max(0, Math.min(v, cap, reserve));
  }

  isHumanTeam(code) {
    const t = this.teams[code];
    const m = t && this.members.get(t.ownerId);
    return !!m && !m.bot;
  }

  botsAct(now) {
    const lot = this.lot;
    const next = this.nextBidAmount();
    const p = PLAYER_BY_ID.get(lot.id);
    let changed = false;
    for (const m of this.members.values()) {
      if (!m.bot) continue;
      const team = this.teams[m.team];
      if (!team || lot.leader === team.code || lot.passed.includes(team.code)) continue;
      if (this.bidBlocker(team, next)) continue;
      const key = `${team.code}:${lot.history.length}`;
      if (!this.botPlans[key]) {
        const lvl = CPU_LEVELS[this.settings.cpuLevel] || CPU_LEVELS.medium;
        // easy computers sometimes simply let a human have the player
        const humanLeads = lot.leader && this.isHumanTeam(lot.leader);
        const letGo = humanLeads && this.rnd() < lvl.letGo;
        const wants = !letGo && next <= this.botValuation(team, p);
        // bots wait a human-ish delay, never within the last ~0.6s for fairness
        const [d0, d1] = lvl.delay;
        const delay = d0 + this.rnd() * Math.min(d1 - d0, (lot.endsAt - now) * 0.5);
        this.botPlans[key] = { at: now + delay, wants };
      }
      const plan = this.botPlans[key];
      if (now < plan.at) continue;
      if (!plan.wants) {
        lot.passed.push(team.code);
        this.checkAllPassed(now);
        changed = true;
        continue;
      }
      // jump-bid when the price is far below what the bot is willing to pay
      const val = this.botValuation(team, p);
      let amount = next;
      const jumpChance = (CPU_LEVELS[this.settings.cpuLevel] || CPU_LEVELS.medium).jump;
      if (val > next * 1.5 && this.rnd() < jumpChance) {
        const jump = Math.min(500, Math.floor(((val - next) * 0.5) / 25) * 25);
        if (jump >= 25 && !this.bidBlocker(team, next + jump)) amount = next + jump;
      }
      try { this.placeBid(m.id, amount, now); return true; } catch { /* lost race */ }
    }
    return changed;
  }

  // ---------- views ----------
  publicState(now = Date.now()) {
    const lot = this.lot && {
      ...this.lot,
      history: this.lot.history.slice(-8),
      bidCount: this.lot.history.length,
      next: this.lot.status === 'live' ? this.nextBidAmount() : null,
      remaining: this.paused ? this.pausedRemaining : Math.max(0, this.lot.endsAt - now),
    };
    const upcoming = this.phase === 'auction' ? this.queue.slice(this.idx + 1, this.idx + 6).map((q) => q.id) : [];
    return {
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      settings: this.settings,
      members: [...this.members.values()].map(({ _chatTimes, _reactTimes, ...m }) => m),
      teams: this.teams,
      lot,
      paused: this.paused,
      round: this.round,
      progress: { done: Math.max(0, this.idx), total: this.queue.length },
      upcoming,
      log: this.log.slice(-25),
      chat: this.chat.slice(-60),
      trades: this.trades.slice(-40),
      serverNow: now,
      nextLotAt: this.nextLotAt,
    };
  }
}

// Rough auction value from rating: 99 ≈ ₹20 Cr, 90 ≈ ₹9 Cr, 80 ≈ ₹1.5 Cr, below 70 nothing extra
export const marketValue = (p) => (p.rating <= 70 ? 0 : Math.round(Math.pow((p.rating - 70) / 29, 2.2) * 2000 / 5) * 5);

// Display names: printable characters only, collapsed spaces, 18 max
export const cleanName = (n) => String(n ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18);

const same = (x, y) => x.length === y.length && x.every((v) => y.includes(v));

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeCode(existing) {
  for (;;) {
    let c = '';
    for (let i = 0; i < 5; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!existing.has(c)) return c;
  }
}
