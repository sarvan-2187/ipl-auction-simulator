import test from 'node:test';
import assert from 'node:assert/strict';
import { Room, marketValue, increment, buildQueue, DEFAULT_SETTINGS, PLAYER_BY_ID, roleCounts } from './game.js';

test('increments follow IPL slabs', () => {
  assert.equal(increment(30), 5);
  assert.equal(increment(150), 10);
  assert.equal(increment(300), 20);
  assert.equal(increment(700), 25);
  assert.equal(increment(1200), 50);
});

test('queue starts with marquee players and has no duplicates', () => {
  const q = buildQueue(DEFAULT_SETTINGS, 5, 42);
  assert.ok(q.length >= 115);
  assert.equal(new Set(q.map((x) => x.id)).size, q.length);
  assert.match(q[0].set, /Marquee/);
});

test('bid validation: stale amounts, self-outbid, purse reserve', () => {
  const r = new Room('TEST1', 'h');
  r.join('h', 'Host'); r.join('f', 'Friend');
  r.pickTeam('h', 'CSK'); r.pickTeam('f', 'MI');
  assert.throws(() => r.pickTeam('f', 'CSK'), /taken/);
  let t = 0;
  r.start('h', t);
  r.tick((t += 3000));
  const base = r.lot.base;
  r.placeBid('h', base, t);
  assert.throws(() => r.placeBid('h', base + increment(base), t), /already/);
  // stale tap (Friend saw no bid yet): follows Host by one step instead of failing
  r.placeBid('f', base, t, null);
  assert.equal(r.lot.leader, 'MI');
  assert.equal(r.lot.bid, base + increment(base));
  // price ran two steps past the tap: refused with the new price
  r.placeBid('h', r.nextBidAmount(), t);
  r.placeBid('f', r.nextBidAmount(), t);
  assert.throws(() => r.placeBid('h', base, t, null), /Price moved/);
  // passing is final for that player
  r.pass('h', t);
  assert.throws(() => r.placeBid('h', r.nextBidAmount(), t), /passed/);
  r.lot.passed = [];
  r.teams.CSK.purse = 17 * 30 + 1; // can only afford reserve
  assert.throws(() => r.placeBid('h', r.nextBidAmount(), t), /purse/);
});

test('full bot auction completes with legal squads', () => {
  const r = new Room('BOTS1', 'h');
  r.join('h', 'Host');
  for (const c of ['CSK', 'MI', 'RCB', 'KKR', 'SRH']) r.addBot('h', c);
  let t = 0;
  r.start('h', t);
  let guard = 0;
  while (r.phase === 'auction' && guard++ < 200000) r.tick((t += 200));
  assert.equal(r.phase, 'results');
  let sold = 0;
  for (const team of Object.values(r.teams)) {
    assert.ok(team.purse >= 0, `${team.code} purse ${team.purse}`);
    assert.ok(team.squad.length <= r.settings.maxSquad);
    const os = team.squad.filter((s) => PLAYER_BY_ID.get(s.id).overseas).length;
    assert.ok(os <= r.settings.maxOverseas);
    sold += team.squad.length;
    console.log(team.code, team.squad.length, 'players, left', team.purse / 100, 'Cr, top buy', Math.max(...team.squad.map((s) => s.price)) / 100, 'Cr');
  }
  console.log('sold', sold, 'sim minutes', (t / 60000).toFixed(1));
  assert.ok(sold > 60);
  for (const team of Object.values(r.teams)) {
    const c = roleCounts(team.squad);
    console.log(team.code, 'roles', JSON.stringify(c));
  }
});

test('rematch returns the room to the lobby with the same people', () => {
  const r = new Room('RM001', 'h');
  r.join('h', 'Host'); r.join('f', 'Friend');
  r.pickTeam('h', 'CSK'); r.pickTeam('f', 'MI');
  r.start('h', 0);
  r.hostAction('h', 'end', 1000);
  assert.equal(r.phase, 'results');
  assert.throws(() => r.rematch('f'), /host/);
  r.rematch('h');
  assert.equal(r.phase, 'lobby');
  assert.equal(r.members.get('f').team, 'MI');
  assert.deepEqual(r.teams, {});
  r.start('h', 2000);
  assert.equal(r.phase, 'auction');
});

test('squad rules: role minimums block bids that would make them impossible', async () => {
  const { ROLES, roleCounts } = await import('./game.js');
  const r = new Room('RULE1', 'h');
  r.join('h', 'Host'); r.join('f', 'Friend');
  r.pickTeam('h', 'CSK'); r.pickTeam('f', 'MI');
  r.updateSettings('h', { maxSquad: 11, minSquad: 11, roleMin: { BAT: 3, BOWL: 4, AR: 2, WK: 2 } });
  r.start('h', 0);
  r.tick(3000);
  const team = r.teams.CSK;
  // fill 9 slots with batters only -> 2 slots left, but still need BOWL 4, AR 2, WK 2
  const bats = [...PLAYER_BY_ID.values()].filter((p) => p.role === 'BAT').slice(0, 9);
  team.squad = bats.map((p) => ({ id: p.id, price: 30, role: 'BAT' }));
  const batter = [...PLAYER_BY_ID.values()].find((p) => p.role === 'BAT' && !bats.includes(p) && p.roles.length === 1);
  r.lot = { ...r.lot, id: batter.id, base: batter.base, bid: null, leader: null, status: 'live', passed: [], history: [] };
  assert.match(r.bidBlocker(team, batter.base), /Need/);
  assert.deepEqual(Object.keys(roleCounts(team.squad)), ROLES);
});

test('setRole only allows eligible roles and changes the role used', () => {
  const r = new Room('ROLE1', 'h');
  r.join('h', 'Host'); r.join('f', 'F'); r.pickTeam('h', 'CSK'); r.pickTeam('f', 'MI'); r.start('h', 0);
  const ar = [...PLAYER_BY_ID.values()].find((p) => p.role === 'AR' && p.roles.includes('BAT'));
  const bat = [...PLAYER_BY_ID.values()].find((p) => p.role === 'BAT' && p.roles.length === 1);
  r.teams.CSK.squad = [{ id: ar.id, price: 100, role: 'AR' }, { id: bat.id, price: 100, role: 'BAT' }];
  r.setRole('h', ar.id, 'BAT');
  assert.equal(r.teams.CSK.squad[0].role, 'BAT');
  assert.throws(() => r.setRole('h', bat.id, 'BOWL'), /can't play/);
  assert.throws(() => r.setRole('f', ar.id, 'AR'), /Not in your squad/);
});

test('user report: 1 Cr left, need 1 AR + 2 WK -> 30L bowler blocked with a clear reason, keeper allowed', () => {
  const r = new Room('PURSE', 'h');
  r.join('h', 'Host'); r.join('f', 'F'); r.pickTeam('h', 'PBKS'); r.pickTeam('f', 'MI');
  r.updateSettings('h', { maxSquad: 15, minSquad: 11, maxOverseas: 5 });
  r.start('h', 0);
  r.tick(3000);
  const all = [...PLAYER_BY_ID.values()];
  const pick = (role, n) => all.filter((p) => p.role === role && p.roles.length === 1 && !p.overseas).slice(0, n);
  const team = r.teams.PBKS;
  team.purse = 100;
  team.squad = [...pick('BAT', 5).map((p) => ({ id: p.id, price: 100, role: 'BAT' })), ...pick('BOWL', 4).map((p) => ({ id: p.id, price: 100, role: 'BOWL' })), { id: all.find((p) => p.role === 'AR').id, price: 100, role: 'AR' }];
  const bowler = all.find((p) => p.name === 'Ben Dwarshuis');
  r.lot = { ...r.lot, id: bowler.id, base: 30, bid: null, leader: null, status: 'live', passed: [], history: [] };
  const why = r.bidBlocker(team, 30);
  assert.match(why, /keep ₹90 L for 1 AR, 2 WK/);
  const keeper = all.find((p) => p.role === 'WK' && !p.overseas && p.base === 30);
  r.lot = { ...r.lot, id: keeper.id };
  assert.equal(r.bidBlocker(team, 30), null);
});

test('playing XI: auto-pick is legal, bots lock on finish, humans can set and lock', async () => {
  const { autoXI, xiInfo } = await import('./xi.js');
  const r = new Room('XI001', 'h');
  r.join('h', 'Host');
  for (const c of ['CSK', 'MI', 'RCB']) r.addBot('h', c);
  r.pickTeam('h', 'KKR');
  let t = 0; r.start('h', t);
  while (r.phase === 'auction') r.tick((t += 200));
  for (const team of Object.values(r.teams)) {
    const m = r.members.get(team.ownerId);
    if (m.bot) {
      assert.equal(team.xiLocked, true);
      const info = xiInfo(team.xi, team.squad, PLAYER_BY_ID);
      assert.ok(info.os <= 4 && team.xi.length === Math.min(11, team.squad.length), JSON.stringify(info));
      console.log(team.code, 'XI rating', info.rating, info.issues.join('; ') || 'valid');
    }
  }
  // give the human a squad and lock an auto XI
  r.teams.KKR.squad = r.teams.CSK.squad.map((x) => ({ ...x }));
  const ids = autoXI(r.teams.KKR.squad, PLAYER_BY_ID);
  r.setXI('h', ids, true);
  assert.equal(r.teams.KKR.xiLocked, true);
  assert.throws(() => r.setXI('h', ids.slice(0, 5), true), /Pick 11/);
});

test('computer difficulty: easy values players lower than medium, medium lower than hard', () => {
  const vals = {};
  for (const level of ['easy', 'medium', 'hard']) {
    const r = new Room('DIF' + level, 'h');
    r.join('h', 'Host'); r.pickTeam('h', 'CSK'); r.addBot('h', 'MI');
    r.updateSettings('h', { cpuLevel: level });
    assert.equal(r.settings.cpuLevel, level);
    r.seed = 1234; // same randomness for each level
    r.start('h', 0); r.tick(3000);
    const star = [...PLAYER_BY_ID.values()].find((p) => p.name === 'Virat Kohli');
    vals[level] = r.botValuation(r.teams.MI, star);
  }
  assert.ok(vals.easy < vals.medium && vals.medium < vals.hard, JSON.stringify(vals));
  assert.throws(() => new Room('X', 'h').updateSettings('f', { cpuLevel: 'hard' }), /host/);
});

test('room chat: trims, caps length, rate-limits, keeps the last 60', () => {
  const r = new Room('CHAT1', 'h');
  r.join('h', 'Host'); r.join('f', 'Friend');
  const m = r.addChat('h', '   hello\n  world  ', 1000);
  assert.equal(m.text, 'hello world');
  assert.equal(r.addChat('f', 'x'.repeat(500), 1000).text.length, 240);
  assert.throws(() => r.addChat('h', '   ', 1000), /empty/);
  assert.throws(() => r.addChat('stranger', 'hi', 1000), /Not in room/);
  for (let i = 0; i < 5; i++) r.addChat('h', 'spam ' + i, 2000 + i);
  assert.throws(() => r.addChat('h', 'one more', 2100), /Slow down/);
  for (let i = 0; i < 80; i++) r.addChat('f', 'm' + i, 100000 + i * 3000);
  assert.equal(r.publicState().chat.length, 60);
  assert.ok(!('_chatTimes' in r.publicState().members[0]));
});

test('spectators: up to 10 watchers, reactions rate-limited, host transfer', () => {
  const r = new Room('SPEC1', 'h');
  r.join('h', 'Host'); r.pickTeam('h', 'CSK'); r.join('f', 'F'); r.pickTeam('f', 'MI');
  for (let i = 0; i < 10; i++) r.join('s' + i, 'Watcher ' + i);
  assert.equal(r.spectators().length, 10);
  assert.throws(() => r.join('s10', 'One too many'), /10 spectators/);
  r.join('s3', 'Watcher 3'); // rejoining is always allowed
  // reactions
  assert.ok(r.react('s1', 'fire', 1000).spectator);
  assert.throws(() => r.react('s1', 'fire', 1500), /Easy/);       // too soon
  assert.throws(() => r.react('s2', 'lol', 3000), /Unknown/);
  for (const t of [3000, 4600, 6200]) r.react('s1', 'clap', t);
  assert.throws(() => r.react('s1', 'clap', 7800), /Easy/);     // 4 in 10 s
  const room = new Room('SPEC2', 'h'); room.join('h', 'H');
  for (let i = 0; i < 8; i++) room.join('x' + i, 'X');
  let ok = 0; for (let i = 0; i < 8; i++) { try { room.react('x' + i, 'fire', 20000); ok++; } catch {} }
  assert.equal(ok, 6); // room-wide cap per second
  // host transfer
  assert.throws(() => r.transferHost('f', 'f'), /host/);
  r.transferHost('h', 's5'); assert.equal(r.hostId, 's5');
  r.members.get('f').connected = false;
  assert.throws(() => r.transferHost('s5', 'f'), /offline/);
  r.addBot('s5', 'RCB'); assert.throws(() => r.transferHost('s5', 'bot-RCB'), /person/);
});

test('post-auction trading: offers, accept, cash, limits, computer replies', () => {
  const r = new Room('TRADE', 'h');
  r.join('h', 'Host'); r.pickTeam('h', 'CSK'); r.join('f', 'F'); r.pickTeam('f', 'MI'); r.addBot('h', 'RCB');
  r.start('h', 0);
  assert.throws(() => r.proposeTrade('h', { to: 'MI', give: [], get: [] }), /after the auction/);
  r.devFillAndFinish();
  const csk = r.teams.CSK, mi = r.teams.MI, rcb = r.teams.RCB;
  const indian = (t) => t.squad.find((x) => !PLAYER_BY_ID.get(x.id).overseas);
  const a1 = indian(csk), b1 = indian(mi);
  csk.xi = csk.squad.slice(0, 11).map((x) => x.id); csk.xiLocked = true;
  const before = { csk: csk.purse, mi: mi.purse };
  const { trade } = r.proposeTrade('h', { to: 'MI', give: [a1.id], get: [b1.id], cash: 100 });
  assert.throws(() => r.respondTrade('h', trade.id, true), /other team/);
  r.respondTrade('f', trade.id, true);
  assert.equal(trade.status, 'accepted');
  assert.ok(mi.squad.some((x) => x.id === a1.id) && csk.squad.some((x) => x.id === b1.id));
  assert.equal(csk.purse, before.csk - 100); assert.equal(mi.purse, before.mi + 100);
  assert.equal(csk.xiLocked, false); assert.ok(!csk.xi.includes(a1.id));
  // stale offer: a player already moved
  const t2 = r.proposeTrade('h', { to: 'MI', give: [b1.id], get: [], cash: -5 }).trade;
  r.proposeTrade('f', { to: 'CSK', give: [], get: [b1.id], cash: 50 });
  r.respondTrade('h', r.trades.at(-1).id, true);
  assert.equal(t2.status, 'failed');
  // limits
  assert.throws(() => r.proposeTrade('h', { to: 'MI', give: [], get: [], cash: 50 }), /at least one player/);
  assert.throws(() => r.proposeTrade('h', { to: 'MI', give: [csk.squad[0].id], get: [], cash: 99995 }), /Ask/);
  assert.throws(() => r.proposeTrade('h', { to: 'MI', get: [mi.squad[0].id], cash: csk.purse + 5 }), /afford/);
  // a computer team won't give away its best player for nothing, but sells a bench player for cash
  const star = rcb.squad.slice().sort((x, y) => PLAYER_BY_ID.get(y.id).rating - PLAYER_BY_ID.get(x.id).rating)[0];
  assert.equal(r.proposeTrade('h', { to: 'RCB', give: [csk.squad.at(-1).id], get: [star.id] }).trade.status, 'rejected');
  const bench = rcb.squad.find((x) => !rcb.xi.includes(x.id));
  assert.equal(r.proposeTrade('h', { to: 'RCB', get: [bench.id], cash: Math.max(bench.price, marketValue(PLAYER_BY_ID.get(bench.id))) - 5 }).trade.status, 'rejected'); // below his value
  assert.equal(r.proposeTrade('h', { to: 'RCB', get: [bench.id], cash: Math.max(bench.price, marketValue(PLAYER_BY_ID.get(bench.id))) + 100 }).trade.status, 'accepted');
  // and a star doesn't go for small change
  const star2 = rcb.squad.slice().sort((x, y) => PLAYER_BY_ID.get(y.id).rating - PLAYER_BY_ID.get(x.id).rating)[0];
  assert.equal(r.proposeTrade('h', { to: 'RCB', get: [star2.id], cash: 300 }).trade.status, 'rejected');
  assert.ok(rcb.xiLocked && rcb.xi.length === 11);
  // switched off
  const off = new Room('TOFF', 'h'); off.join('h', 'H'); off.pickTeam('h', 'CSK'); off.addBot('h', 'MI');
  off.updateSettings('h', { trading: false }); off.start('h', 0); off.devFillAndFinish();
  assert.throws(() => off.proposeTrade('h', { to: 'MI', get: [off.teams.MI.squad[0].id], cash: 50 }), /turned off/);
});
