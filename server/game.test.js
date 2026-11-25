import test from 'node:test';
import assert from 'node:assert/strict';
import { Room, increment, buildQueue, DEFAULT_SETTINGS, PLAYER_BY_ID, roleCounts } from './game.js';

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
  assert.throws(() => r.placeBid('f', base, t), /Someone bid first/);
  r.placeBid('f', base + increment(base), t);
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
