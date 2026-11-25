import express from 'express';
import compression from 'compression';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { Room, makeCode } from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'client', 'dist');
const PORT = process.env.PORT || 3001;

const app = express();
app.set('trust proxy', 1);
app.use(compression());
// Photos, fonts, flags and hashed build assets never change between deploys of the same file name
const LONG = { maxAge: '30d', immutable: true, index: false };
for (const dir of ['assets', 'players', 'fonts', 'flags', 'teams']) app.use(`/${dir}`, express.static(path.join(DIST, dir), LONG));
app.use(express.static(DIST, { maxAge: '5m', index: false }));
// Health check for UptimeRobot / Render. Cheap, never cached, works for HEAD and GET.
// Keyword monitors can look for: "status":"ok"
const STARTED = Date.now();
function health(_req, res) {
  let live = 0, players = 0;
  for (const r of rooms.values()) {
    if (r.phase === 'auction') live++;
    for (const m of r.members.values()) if (m.connected && !m.bot) players++;
  }
  res.set('Cache-Control', 'no-store, max-age=0');
  res.json({
    status: 'ok',
    service: 'ipl-auction',
    uptimeSeconds: Math.round((Date.now() - STARTED) / 1000),
    rooms: rooms.size,
    liveAuctions: live,
    playersOnline: players,
    version: (process.env.RENDER_GIT_COMMIT || 'dev').slice(0, 7),
    time: new Date().toISOString(),
  });
}
app.get('/api/health', health);
app.get('/healthz', health);
app.all('/api/*', (_req, res) => res.status(404).json({ status: 'error', error: 'Not found' }));
app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html'), (err) => err && res.status(404).send('Run "npm run build" first, or use "npm run dev".')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });

/** @type {Map<string, Room>} */
const rooms = new Map();

function broadcast(room) {
  room.version++;
  io.to(room.code).emit('state', room.publicState());
}

function reply(cb, fn) {
  try {
    const out = fn();
    cb?.({ ok: true, ...out });
  } catch (e) {
    cb?.({ ok: false, error: e.message || 'Something went wrong' });
  }
}

io.on('connection', (socket) => {
  let room = null;
  let memberId = null;

  const attach = (r, id) => {
    room = r;
    memberId = id;
    socket.data.memberId = id;
    socket.join(r.code);
  };

  socket.on('create', ({ memberId: id, name }, cb) =>
    reply(cb, () => {
      if (!id) throw new Error('Missing player id');
      const code = makeCode(rooms);
      const r = new Room(code, id);
      rooms.set(code, r);
      r.join(id, name);
      attach(r, id);
      broadcast(r);
      return { code };
    }),
  );

  socket.on('join', ({ code, memberId: id, name }, cb) =>
    reply(cb, () => {
      const r = rooms.get(String(code || '').toUpperCase().trim());
      if (!r) throw new Error('Room not found. Check the code.');
      if (!id) throw new Error('Missing player id');
      r.join(id, name);
      attach(r, id);
      r.touch();
      broadcast(r);
      return { code: r.code };
    }),
  );

  const act = (event, fn) =>
    socket.on(event, (payload, cb) =>
      reply(cb, () => {
        if (!room) throw new Error('Not in a room');
        const out = fn(payload || {});
        room.touch();
        broadcast(room);
        return out;
      }),
    );

  act('pickTeam', ({ team }) => room.pickTeam(memberId, team));
  act('leaveTeam', () => room.leaveTeam(memberId));
  act('addBot', ({ team }) => room.addBot(memberId, team));
  act('removeMember', ({ id }) => room.removeMember(memberId, id));
  act('settings', (patch) => room.updateSettings(memberId, patch));
  act('start', () => room.start(memberId));
  act('bid', ({ amount, seen }) => room.placeBid(memberId, Number(amount), Date.now(), seen === undefined ? undefined : seen));
  act('pass', () => room.pass(memberId));
  act('host', ({ action }) => room.hostAction(memberId, action));
  act('rematch', () => room.rematch(memberId));
  act('setRole', ({ id, role }) => room.setRole(memberId, id, role));
  act('rename', ({ name }) => {
    const m = room.members.get(memberId);
    if (m && name) m.name = String(name).slice(0, 18);
  });


  // Leave the room for good (New auction / back button)
  socket.on('leave', () => {
    if (!room) return;
    const r = room;
    socket.leave(r.code);
    const m = r.members.get(memberId);
    const stillHere = [...(io.sockets.adapter.rooms.get(r.code) || [])].some((sid) => io.sockets.sockets.get(sid)?.data.memberId === memberId);
    if (m && !stillHere) {
      // in the lobby, free their franchise for someone else; mid/after auction keep the squad
      if (r.phase === 'lobby') r.members.delete(memberId);
      else m.connected = false;
      if (memberId === r.hostId) {
        const next = [...r.members.values()].find((x) => !x.bot && x.connected && x.id !== memberId);
        if (next) r.hostId = next.id;
      }
    }
    room = null;
    socket.data.memberId = undefined;
    broadcast(r);
  });

  socket.on('disconnect', () => {
    if (!room) return;
    const m = room.members.get(memberId);
    const stillHere = [...(io.sockets.adapter.rooms.get(room.code) || [])]
      .map((sid) => io.sockets.sockets.get(sid))
      .some((s) => s && s !== socket && s.data.memberId === memberId);
    if (m && !stillHere) m.connected = false;
    broadcast(room);
  });

});

// Game clock
setInterval(() => {
  const now = Date.now();
  for (const r of rooms.values()) if (r.tick(now)) broadcast(r);
}, 200);

// Housekeeping: drop rooms idle for 6h, or empty lobbies after 30 min
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    const anyone = [...r.members.values()].some((m) => m.connected && !m.bot);
    if (now - r.lastActive > 6 * 3600e3 || (!anyone && now - r.lastActive > 30 * 60e3)) rooms.delete(code);
  }
}, 60e3);

server.listen(PORT, () => console.log(`IPL Auction server on http://localhost:${PORT}`));
