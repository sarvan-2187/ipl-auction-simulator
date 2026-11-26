// Abuse protection for a small game server. This handles floods from a few clients
// (scripts, bots, someone holding down a key); a real volumetric DDoS has to be stopped
// before it reaches the app, by Render's edge or a proxy such as Cloudflare.

// ---------- client IP ----------
// Render sits one proxy hop in front of the app (express 'trust proxy' = 1), so the
// address that proxy saw is the last entry it appended to X-Forwarded-For.
export function clientIp(headers = {}, fallback = '') {
  const xff = String(headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : String(fallback || '').replace(/^::ffff:/, '');
}

// ---------- rate limiting ----------
// Token bucket: `rate` tokens per second, bursts up to `burst`.
export class Buckets {
  constructor(rate, burst, max = 50000) { this.rate = rate; this.burst = burst; this.max = max; this.map = new Map(); }
  take(key, cost = 1, now = Date.now()) {
    let b = this.map.get(key);
    if (!b) {
      if (this.map.size >= this.max) this.sweep(now, true);
      b = { tokens: this.burst, at: now };
      this.map.set(key, b);
    }
    b.tokens = Math.min(this.burst, b.tokens + ((now - b.at) / 1000) * this.rate);
    b.at = now;
    if (b.tokens < cost) return false;
    b.tokens -= cost;
    return true;
  }
  // drop buckets that have refilled; under pressure drop the oldest half
  sweep(now = Date.now(), hard = false) {
    const full = (this.burst / this.rate) * 1000;
    for (const [k, b] of this.map) if (now - b.at > full) this.map.delete(k);
    if (hard && this.map.size >= this.max) {
      const old = [...this.map.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, this.map.size / 2);
      for (const [k] of old) this.map.delete(k);
    }
  }
}

// Sliding window counter: at most `limit` events per `windowMs`
export class Window {
  constructor(limit, windowMs) { this.limit = limit; this.windowMs = windowMs; this.map = new Map(); }
  hit(key, now = Date.now()) {
    const list = (this.map.get(key) || []).filter((t) => now - t < this.windowMs);
    if (list.length >= this.limit) { this.map.set(key, list); return false; }
    list.push(now);
    this.map.set(key, list);
    return true;
  }
  sweep(now = Date.now()) {
    for (const [k, list] of this.map) if (!list.some((t) => now - t < this.windowMs)) this.map.delete(k);
  }
}

export const LIMITS = {
  // HTTP: pages and API calls (static files are cheap and long-cached, they get a much bigger allowance)
  httpRate: 2, httpBurst: 60,
  staticRate: 120, staticBurst: 2500, // ~150 files per page load; a household of friends shares one IP
  // Socket.IO
  connectionsPerIp: 24, // a household on one Wi-Fi with several tabs stays well under this
  eventRate: 12, eventBurst: 40, // per socket; a frantic bidder sends ~5/s
  strikesBeforeKick: 40, // dropped events before the socket is disconnected
  roomsPerIp: 8, roomsWindowMs: 10 * 60e3,
  maxRooms: 1000,
  maxPayloadBytes: 8 * 1024,
};

// ---------- HTTP ----------
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // framer-motion and React style props write inline styles
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' ws: wss:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

const STATIC = /^\/(assets|players|fonts|flags|teams|emoji|data)\/|\.(png|jpe?g|webp|svg|ico|woff2?|webmanifest|txt)$/;

export function httpLimiter() {
  const pages = new Buckets(LIMITS.httpRate, LIMITS.httpBurst);
  const files = new Buckets(LIMITS.staticRate, LIMITS.staticBurst);
  setInterval(() => { pages.sweep(); files.sweep(); }, 60e3).unref();
  return (req, res, next) => {
    // uptime monitors, and the game socket (which has its own limits in socketGuard)
    if (req.path === '/api/health' || req.path === '/healthz' || req.path.startsWith('/socket.io/')) return next();
    const ok = (STATIC.test(req.path) ? files : pages).take(req.ip || 'unknown');
    if (ok) return next();
    res.setHeader('Retry-After', '10');
    res.status(429).type('text').send('Too many requests. Slow down and try again in a few seconds.');
  };
}

// Reject odd methods and oversized bodies early; the app only serves GET/HEAD (+ the dev POST)
export function requestGuard(req, res, next) {
  if (!['GET', 'HEAD', 'POST', 'OPTIONS'].includes(req.method)) return res.status(405).end();
  const len = Number(req.headers['content-length'] || 0);
  if (len > LIMITS.maxPayloadBytes) return res.status(413).end();
  if (req.originalUrl.length > 2048) return res.status(414).end();
  next();
}

// Slowloris-style protection: don't let idle or trickling connections hold sockets forever
export function hardenServer(server) {
  server.headersTimeout = 15e3;
  server.requestTimeout = 30e3;
  server.keepAliveTimeout = 65e3; // longer than Render's proxy idle timeout
  server.maxHeadersCount = 100;
}

// ---------- Socket.IO ----------
// Only pages served from an address we know may open a game socket
export function originAllowed(origin, host) {
  if (!origin) return true; // native clients and same-origin requests in some browsers
  let o;
  try { o = new URL(origin); } catch { return false; }
  const h = o.hostname.toLowerCase();
  if (host && o.host.toLowerCase() === String(host).toLowerCase()) return true;
  if (h === 'localhost' || h === '127.0.0.1') return true;
  const extra = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return h === 'ipl.sarvankumar.in' || h.endsWith('.onrender.com') || extra.includes(h);
}

export function socketGuard(io) {
  const perIp = new Map(); // ip -> open sockets
  const rooms = new Window(LIMITS.roomsPerIp, LIMITS.roomsWindowMs);
  setInterval(() => rooms.sweep(), 60e3).unref();

  io.use((socket, next) => {
    const ip = clientIp(socket.handshake.headers, socket.handshake.address);
    const n = perIp.get(ip) || 0;
    if (n >= LIMITS.connectionsPerIp) return next(new Error('Too many connections from your network'));
    perIp.set(ip, n + 1);
    socket.data.ip = ip;
    socket.once('disconnect', () => {
      const left = (perIp.get(ip) || 1) - 1;
      if (left <= 0) perIp.delete(ip); else perIp.set(ip, left);
    });

    // per-socket event flood control
    const bucket = new Buckets(LIMITS.eventRate, LIMITS.eventBurst, 1);
    let strikes = 0;
    socket.use((packet, nextEvent) => {
      const ack = typeof packet[packet.length - 1] === 'function' ? packet[packet.length - 1] : null;
      const payload = packet[1];
      const reject = (error) => { ack?.({ ok: false, error }); }; // answer right away so the UI doesn't hang
      if (payload != null && typeof payload !== 'object' && typeof payload !== 'function') return reject('Bad request');
      if (bucket.take('s')) return nextEvent();
      if (++strikes >= LIMITS.strikesBeforeKick) socket.disconnect(true);
      reject('Slow down a little');
    });
    socket.on('error', () => {}); // rejected events surface here; nothing to do
    next();
  });

  return {
    // called before creating a room
    canCreateRoom(socket, roomCount) {
      if (roomCount >= LIMITS.maxRooms) return 'The server is full right now. Try again in a few minutes.';
      if (!rooms.hit(socket.data.ip || 'unknown')) return 'Too many rooms created from your network. Try again later.';
      return null;
    },
  };
}
