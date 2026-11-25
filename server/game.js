// Auction engine. Pure state + rules; socket wiring lives in index.js.
// All money values are in lakhs (100 lakhs = 1 crore).
import { readFileSync } from 'node:fs';

export const PLAYERS = JSON.parse(readFileSync(new URL('./players.json', import.meta.url), 'utf8'));
export const PLAYER_BY_ID = new Map(PLAYERS.map((p) => [p.id, p]));
export const TEAM_CODES = ['CSK', 'MI', 'RCB', 'KKR', 'DC', 'PBKS', 'RR', 'SRH', 'GT', 'LSG'];

export const DEFAULT_SETTINGS = {
  purse: 12000, // 120 Cr
  maxSquad: 20,
  minSquad: 15,
  maxOverseas: 8,
  bidTime: 10, // seconds the clock resets to after each bid
  pool: 'quick', // quick | standard | full
  unsoldRound: true,
};
export const POOL_SIZES = { blitz: 60, quick: 120, standard: 220, full: Infinity };
const MIN_BASE = 30;
const RESULT_PAUSE_MS = 3200;
const BOT_NAMES = ['Bot Dhoni', 'Bot Ponting', 'Bot Fleming', 'Bot Nehra', 'Bot Gambhir', 'Bot Kumble', 'Bot Vettori', 'Bot Sangakkara', 'Bot Warne', 'Bot Jayawardene'];

export function increment(bid) {
  if (bid < 100) return 5;
  if (bid < 200) return 10;
  if (bid < 500) return 20;
  return 25;
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
  // Top ~65% by rating + a random mix of the rest so squads can be filled with bargains
  const sorted = [...PLAYERS].sort((a, b) => b.rating - a.rating);
  const top = Math.round(want * 0.65);
  const pool = [...sorted.slice(0, top), ...shuffle(sorted.slice(top), rnd).slice(0, want - top)];
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
    const ex = this.members.get(memberId);
    if (ex) { ex.connected = true; if (name) ex.name = name; return ex; }
    if (this.phase !== 'lobby' && this.humanCount() >= 10) throw new Error('Room is full');
    const m = { id: memberId, name: String(name || 'Player').slice(0, 18), team: null, connected: true, bot: false };
    this.members.set(memberId, m);
    return m;
  }

  humanCount() { return [...this.members.values()].filter((m) => !m.bot).length; }

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
    else if (m.bot) throw new Error('Cannot remove a bot mid-auction');
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
    if (s.minSquad > s.maxSquad) s.minSquad = s.maxSquad;
    this.settings = s;
  }

  assertHost(id) { if (id !== this.hostId) throw new Error('Only the host can do that'); }

  // ---------- auction ----------
  start(byId, now = Date.now()) {
    this.assertHost(byId);
    if (this.phase !== 'lobby') throw new Error('Already started');
    const owners = [...this.members.values()].filter((m) => m.team);
    if (owners.length < 2) throw new Error('Need at least 2 teams (add a bot or invite a friend)');
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
    const slotsAfter = Math.max(0, s.minSquad - team.squad.length - 1);
    if (team.purse - amount < slotsAfter * MIN_BASE) return 'Not enough purse';
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
      history: [], status: 'live', passed: [], n: this.idx + 1,
    };
    this.botPlans = {};
  }

  // `seen` is the bid the client was looking at; protects against double-clicks racing another bid.
  // `amount` may be a jump bid above the next increment.
  placeBid(memberId, amount, now = Date.now(), seen) {
    if (this.phase !== 'auction' || !this.lot || this.lot.status !== 'live') throw new Error('No live lot');
    if (this.paused) throw new Error('Auction is paused');
    const m = this.members.get(memberId);
    const team = m && this.teams[m.team];
    if (!team) throw new Error('You are spectating');
    if (this.lot.leader === team.code) throw new Error('You are already the highest bidder');
    const expected = this.nextBidAmount();
    if (seen !== undefined && seen !== this.lot.bid) throw new Error('Someone bid first, try again');
    if (seen === undefined && amount !== expected) throw new Error('Someone bid first, try again');
    if (!Number.isFinite(amount) || amount < expected || amount % 5 !== 0) throw new Error('Invalid bid amount');
    if (amount > expected + 500) throw new Error('Jump bids are limited to +5 Cr');
    const block = this.bidBlocker(team, amount);
    if (block) throw new Error(block);
    this.lot.bid = amount;
    this.lot.leader = team.code;
    this.lot.history.push({ team: team.code, amount, t: now });
    this.lot.passed = this.lot.passed.filter((c) => c !== team.code);
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
      team.squad.push({ id: lot.id, price: lot.bid });
      lot.status = 'sold';
      this.addLog({ kind: 'sold', id: lot.id, team: team.code, amount: lot.bid, text: `${p.name} SOLD to ${team.code}` });
    } else {
      lot.status = 'unsold';
      if (this.round === 1) this.unsold.push(lot.id);
      this.addLog({ kind: 'unsold', id: lot.id, text: `${p.name} unsold` });
    }
    lot.closedAt = now;
    this.nextLotAt = now + RESULT_PAUSE_MS;
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
    } else if (action === 'hammer') {
      this.hammer(now);
    } else if (action === 'end') {
      if (this.lot?.status === 'live') this.hammer(now);
      this.finish();
    }
  }

  finish() {
    this.phase = 'results';
    this.lot = null;
    this.paused = false;
    this.addLog({ kind: 'info', text: 'Auction complete' });
  }

  // Called ~4x/sec. Returns true when state changed and should be broadcast.
  tick(now = Date.now()) {
    if (this.phase !== 'auction' || this.paused) return false;
    if (!this.lot || this.lot.status !== 'live') {
      if (now >= this.nextLotAt) { this.openNextLot(now); return true; }
      return false;
    }
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
    const roleCount = team.squad.filter((x) => PLAYER_BY_ID.get(x.id)?.role === p.role).length;
    const target = { BAT: 7, BOWL: 8, AR: 5, WK: 3 }[p.role];
    if (roleCount >= target) v *= 0.55;
    const needed = Math.max(0, s.minSquad - team.squad.length);
    const left = this.queue.length - this.idx;
    if (needed > 0 && left < needed * 3) v *= 1.4;
    if (needed > 0 && this.round === 2) v = Math.max(v, p.base * 1.6);
    // Scale to purse so a 200 Cr room bids proportionally bigger than a 90 Cr room
    v *= s.purse / 12000;
    // Spend discipline: never commit more than a share of remaining purse to one player
    const neededSlots = Math.max(1, s.minSquad - team.squad.length);
    const cap = neededSlots <= 3 ? team.purse - (neededSlots - 1) * MIN_BASE : Math.min(team.purse * 0.3, (team.purse / neededSlots) * 3);
    const reserve = team.purse - Math.max(0, s.minSquad - team.squad.length - 1) * 50;
    return Math.max(0, Math.min(v, cap, reserve));
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
        const wants = next <= this.botValuation(team, p);
        // bots wait a human-ish delay, never within the last ~0.6s for fairness
        const delay = 450 + this.rnd() * Math.min(1700, (lot.endsAt - now) * 0.5);
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
      if (val > next * 1.8 && this.rnd() < 0.7) {
        const jump = Math.min(500, Math.floor(((val - next) * 0.4) / 25) * 25);
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
      next: this.lot.status === 'live' ? this.nextBidAmount() : null,
      remaining: this.paused ? this.pausedRemaining : Math.max(0, this.lot.endsAt - now),
    };
    const upcoming = this.phase === 'auction' ? this.queue.slice(this.idx + 1, this.idx + 6).map((q) => q.id) : [];
    return {
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      settings: this.settings,
      members: [...this.members.values()],
      teams: this.teams,
      lot,
      paused: this.paused,
      round: this.round,
      progress: { done: Math.max(0, this.idx), total: this.queue.length },
      upcoming,
      log: this.log.slice(-25),
      serverNow: now,
      nextLotAt: this.nextLotAt,
    };
  }
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeCode(existing) {
  for (;;) {
    let c = '';
    for (let i = 0; i < 5; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!existing.has(c)) return c;
  }
}
