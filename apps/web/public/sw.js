// Cultural Café service worker. Deliberately minimal: it only provides an offline
// page for navigations. It never caches pages, API responses or photos, so no
// private conversation data is ever stored by the browser cache.
const CACHE = 'conversa-shell-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, '/icons/icon-192.png'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  const url = new URL(event.request.url);
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;
  // Android share target: move shared text into the URL fragment so it never reaches the server or its logs.
  if (url.pathname === '/app/assistant' && (url.searchParams.has('text') || url.searchParams.has('title'))) {
    const shared = [url.searchParams.get('title'), url.searchParams.get('text')].filter(Boolean).join('\n');
    event.respondWith(Response.redirect(`/app/assistant#shared=${encodeURIComponent(shared)}`, 303));
    return;
  }
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});
