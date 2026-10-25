// Offline support: the app shell is cached on first open and served from the cache after that.
// Bump VERSION whenever the app files change so phones pick up the new version.
const VERSION = 'yatra-v6';
const ASSETS = [
  './', './index.html', './css/app.css', './manifest.webmanifest',
  './js/app.js', './js/db.js', './js/sync.js', './js/seed.js', './js/sortable.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // Supabase calls go straight to the network
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).catch(() => (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    }),
  );
});
