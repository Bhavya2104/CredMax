// Offline support. Bump VERSION whenever any file below changes so phones
// pick up the new release on their next launch.
const VERSION = 'cardmax-v8';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/art.js',
  './js/engine.js',
  './js/format.js',
  './js/rules.js',
  './js/sms.js',
  './js/split.js',
  './js/store.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Stale-while-revalidate: answer from cache instantly, refresh it in the background.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const key = request.mode === 'navigate' ? './index.html' : request;
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(key, { ignoreSearch: true });
      const fresh = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(key, res.clone());
          return res;
        })
        .catch(() => cached);
      if (cached) {
        event.waitUntil(fresh);
        return cached;
      }
      return fresh;
    }),
  );
});
