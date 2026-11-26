import express from 'express';
import compression from 'compression';
import fs from 'node:fs';
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
// Optional: send visitors on other hostnames (e.g. the onrender.com address) to the custom domain.
// Set CANONICAL_HOST=ipl.sarvankumar.in in Render only after the domain is verified and serving HTTPS.
const CANONICAL_HOST = process.env.CANONICAL_HOST;
app.use((req, res, next) => {
  const host = (req.get('host') || '').toLowerCase();
  if (!CANONICAL_HOST || host === CANONICAL_HOST || host.startsWith('localhost') || host.startsWith('127.0.0.1')) return next();
  if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/socket.io') || req.path === '/healthz') return next();
  res.redirect(301, `https://${CANONICAL_HOST}${req.originalUrl}`);
});
// Photos, fonts, flags and hashed build assets never change between deploys of the same file name
const LONG = { maxAge: '30d', immutable: true, index: false };
for (const dir of ['assets', 'players', 'fonts', 'flags', 'teams', 'emoji']) app.use(`/${dir}`, express.static(path.join(DIST, dir), LONG));
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
    service: 'the-dugout',
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
// Test-only shortcut (DEV_TOOLS=1): fill every squad and jump to the Playing XI screen
if (process.env.DEV_TOOLS === '1') {
  app.post('/api/dev/finish/:code', (req, res) => {
    const r = rooms.get(req.params.code);
    if (!r || r.phase !== 'auction') return res.status(400).json({ error: 'room not in auction' });
    r.devFillAndFinish();
    broadcast(r);
    res.json({ ok: true });
  });
}
app.all('/api/*', (_req, res) => res.status(404).json({ status: 'error', error: 'Not found' }));
// Room links get invite-specific link previews (WhatsApp, Discord, X read these tags)
let indexHtml = null;
const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
app.get('/room/:code', (req, res, next) => {
  try { indexHtml = indexHtml || fs.readFileSync(path.join(DIST, 'index.html'), 'utf8'); } catch { return next(); }
  const code = String(req.params.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const r = rooms.get(code);
  const host = r?.members.get(r.hostId)?.name;
  const taken = r ? [...r.members.values()].filter((m) => m.team).length : 0;
  const title = host ? `${host} invited you to an IPL auction on The Dugout` : 'Join my IPL auction on The Dugout';
  const desc = r
    ? `Room ${code} · ${taken}/10 franchises taken. Pick a team, bid live and build your Playing XI. Free, no sign-up.`
    : `Room ${code}. Pick a franchise, bid live against your friends and build your Playing XI. Free, no sign-up.`;
  const origin = `${req.protocol}://${req.get('host')}`;
  const html = indexHtml
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)} · Room ${code}</title>`)
    .replace(/(property="og:title" content=")[^"]*/, `$1${esc(title)}`)
    .replace(/(name="twitter:title" content=")[^"]*/, `$1${esc(title)}`)
    .replace(/(property="og:description" content=")[^"]*/, `$1${esc(desc)}`)
    .replace(/(name="twitter:description" content=")[^"]*/, `$1${esc(desc)}`)
    .replace(/(name="description" content=")[^"]*/, `$1${esc(desc)}`)
    .replace(/(property="og:url" content=")[^"]*/, `$1${origin}/room/${code}`)
    .replace(/https:\/\/ipl\.sarvankumar\.in\/og\.jpg/g, `${origin}/og-invite.jpg`)
    .replace(/https:\/\/ipl\.sarvankumar\.in/g, origin);
  res.set('Cache-Control', 'no-store').type('html').send(html);
});
app.get('*', (req, res) => {
  try { indexHtml = indexHtml || fs.readFileSync(path.join(DIST, 'index.html'), 'utf8'); }
  catch { return res.status(404).send('Run "npm run build" first, or use "npm run dev".'); }
  // absolute URLs in the meta tags follow whichever address the visitor used (onrender.com or the custom domain)
  const origin = `${req.protocol}://${req.get('host')}`;
  // canonical stays on the custom domain so search engines treat both addresses as one site
  const html = indexHtml.replace(/https:\/\/ipl\.sarvankumar\.in(?![^"]*" \/>\s*\n\s*<!-- Open Graph)/g, origin);
  res.set('Cache-Control', 'no-cache').type('html').send(html.replace(/(rel="canonical" href=")[^"]*/, '$1https://ipl.sarvankumar.in/'));
});

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
  act('setXI', ({ ids, lock }) => room.setXI(memberId, ids, !!lock));
  act('chat', ({ text }) => { room.addChat(memberId, text); });
  act('transferHost', ({ to }) => room.transferHost(memberId, to));
  // reactions are broadcast as events, not stored in room state
  socket.on('react', ({ key } = {}, cb) => {
    if (!room) return cb?.({ ok: false, error: 'Not in a room' });
    try { const r = room.react(memberId, key); io.to(room.code).emit('reaction', r); cb?.({ ok: true }); }
    catch (e) { cb?.({ ok: false, error: e.message }); }
  });
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

server.listen(PORT, () => console.log(`The Dugout server on http://localhost:${PORT}`));
