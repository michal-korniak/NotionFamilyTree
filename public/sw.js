// Makes the app installable and lets it open without a connection. Only the app's own files are cached: Notion requests and photo
// downloads go to other origins and are never touched.
const CACHE = 'nft-app-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || !url.href.startsWith(self.registration.scope)) return;

  // The page itself comes from the network first, so a new deploy shows up at once; the cached copy is only for being offline.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => { const copy = response.clone(); void caches.open(CACHE).then((cache) => cache.put(self.registration.scope, copy)); return response; }).catch(() => caches.match(self.registration.scope)));
    return;
  }

  // Built files have the content hash in their names, so a cached copy never goes stale; icons and the manifest refresh in the background.
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(request);
    const network = fetch(request).then((response) => { if (response.ok) void cache.put(request, response.clone()); return response; });
    if (cached && url.pathname.includes('/assets/')) return cached;
    return cached ? (event.waitUntil(network.catch(() => undefined)), cached) : network;
  }));
});
