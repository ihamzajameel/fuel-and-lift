/* Fuel & Lift service worker
 * - Precaches the whole built app (list injected at build time) so it opens offline.
 * - Network-first for page loads (so updates arrive when online), cache fallback offline.
 * - Cache-first for hashed assets.
 * - Shows notifications for the reminder engine and focuses the app when one is tapped.
 */
const VERSION = 'd3d49bdc0c1e';
const CACHE = `fuel-lift-${VERSION}`;
const MANIFEST = "[\"assets/index-ChLhvwyq.js\",\"assets/index-D4phpmWn.css\",\"icons/apple-touch-icon.png\",\"icons/badge-96.png\",\"icons/icon-192.png\",\"icons/icon-512.png\",\"icons/icon-maskable-512.png\",\"icons/icon.svg\",\"index.html\",\"manifest.json\",\"./\"]";
const PRECACHE = MANIFEST.startsWith('[') ? JSON.parse(MANIFEST) : ['./', 'index.html', 'manifest.json'];

const abs = (p) => new URL(p, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map(abs)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('fuel-lift-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(abs('./'), copy));
          return res;
        })
        .catch(() => caches.match(abs('./')).then((r) => r || caches.match(abs('index.html'))))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});

// Page asks the SW to show a notification (required on Android, where `new Notification()` is not allowed).
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'notify') {
    event.waitUntil(self.registration.showNotification(msg.title, msg.options || {}));
  }
  if (msg.type === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = abs(data.url || './');
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.postMessage({ type: 'notification-click', key: data.key, action: event.action || null });
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

// Ready for a future Web Push backend: show whatever payload the server sends.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'Fuel & Lift', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Fuel & Lift', {
      body: payload.body || '',
      icon: abs('icons/icon-192.png'),
      badge: abs('icons/badge-96.png'),
      data: { url: payload.url || './', key: payload.key },
    })
  );
});
