import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { Room, makeCode } from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'client', 'dist');
const PORT = process.env.PORT || 3001;

const app = express();
app.use(express.static(DIST, { maxAge: '1h', index: false }));
app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: rooms.size }));
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
  act('rename', ({ name }) => {
    const m = room.members.get(memberId);
    if (m && name) m.name = String(name).slice(0, 18);
  });

  socket.on('react', ({ emoji }) => {
    if (!room || typeof emoji !== 'string' || emoji.length > 8) return;
    const m = room.members.get(memberId);
    io.to(room.code).emit('react', { emoji, from: m?.name, team: m?.team, id: Math.random().toString(36).slice(2) });
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
