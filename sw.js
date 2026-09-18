// Service worker: makes the game work offline after the first visit.
// Code files are network-first (so deploys show up), assets cache-first
// (they are versioned by the manifest query string).
const VERSION = 'v2';
const CACHE = `shrimptank-${VERSION}`;
const CORE = ['./', './index.html', './styles.css', './app.webmanifest', './src/main.js', './src/loader.js', './src/rng.js', './src/game.js', './src/audio.js',
  './src/sim/world.js', './src/sim/shrimp.js', './src/sim/ecology.js', './src/sim/genetics.js', './src/sim/narrative.js',
  './src/render/renderer.js', './src/render/shrimpSprite.js', './src/render/plants.js', './src/ui/ui.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const isAsset = url.pathname.includes('/assets/') && !url.pathname.endsWith('manifest.json');
  if (isAsset) {
    e.respondWith(caches.open(CACHE).then(async (c) => { const hit = await c.match(e.request); if (hit) return hit; const res = await fetch(e.request); if (res.ok) c.put(e.request, res.clone()); return res; }));
  } else {
    e.respondWith(fetch(e.request).then((res) => { if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone())); return res; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});
