// The Dugout service worker.
// The game itself is live (Socket.IO), so nothing here pretends to work offline.
// It makes the installed app open fast and survive flaky networks:
//  - pages: network first, cached shell or an offline page when there is no network
//  - built assets, fonts, logos, flags, player photos: cache first (file names never change)
//  - player data: served from cache, refreshed in the background
const VERSION = 'v1';
const SHELL = `dugout-shell-${VERSION}`;
const STATIC = `dugout-static-${VERSION}`;
const DATA = `dugout-data-${VERSION}`;
const PRECACHE = ['/', '/offline.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/favicon.svg', '/data/players.json', '/data/teams.json'];
const MAX_STATIC = 900; // ~511 player photos + logos, flags, fonts and build files

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = new Set([SHELL, STATIC, DATA]);
    for (const k of await caches.keys()) if (k.startsWith('dugout-') && !keep.has(k)) await caches.delete(k);
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

const STATIC_PATH = /^\/(assets|fonts|players|teams|flags|emoji|screenshots)\/|^\/(icon-[\w-]+\.png|apple-touch-icon\.png|favicon[\w.-]*)$/;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/socket.io') || url.pathname.startsWith('/api/') || url.pathname === '/healthz') return;

  if (req.mode === 'navigate') { e.respondWith(page(e)); return; }
  if (STATIC_PATH.test(url.pathname)) { e.respondWith(cacheFirst(req)); return; }
  if (url.pathname.startsWith('/data/')) { e.respondWith(staleWhileRevalidate(req, e)); return; }
});

async function page(e) {
  try {
    const res = (await e.preloadResponse) || (await fetch(e.request));
    // keep the latest shell for the home page so the app opens offline
    if (res.ok && new URL(e.request.url).pathname === '/') (await caches.open(SHELL)).put('/', res.clone());
    return res;
  } catch {
    const cache = await caches.open(SHELL);
    return (await cache.match('/')) || (await cache.match('/offline.html')) || Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) { cache.put(req, res.clone()); trim(cache); }
  return res;
}

async function staleWhileRevalidate(req, e) {
  const cache = await caches.open(DATA);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
  if (hit) { e.waitUntil(fresh); return hit; }
  return fresh;
}

let trimming = false;
async function trim(cache) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - MAX_STATIC; i++) await cache.delete(keys[i]);
  } finally { trimming = false; }
}
