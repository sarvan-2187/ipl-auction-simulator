import test from 'node:test';
import assert from 'node:assert/strict';
import { Room, increment, buildQueue, DEFAULT_SETTINGS, PLAYER_BY_ID } from './game.js';

test('increments follow IPL slabs', () => {
  assert.equal(increment(30), 5);
  assert.equal(increment(150), 10);
  assert.equal(increment(300), 20);
  assert.equal(increment(1200), 25);
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
});
