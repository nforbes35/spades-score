// Family Spades service worker: makes the app installable and lets it open without a connection.
const CACHE = 'spades-score-v3';
// The card reader's model and runtime never change under the same name: keep the first copy.
const KEEP = /^\/models\//;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Network first, falling back to the last copy we saw (so a game can be scored offline).
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (KEEP.test(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('/'))),
  );
});

// "Your turn" alerts while the app is in the background or closed (sent by /api/push).
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Family Spades', {
    body: data.body || 'Your turn',
    tag: data.tag || 'turn',
    renotify: true,
    vibrate: [200, 100, 200, 100, 300],
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
  }));
});

// Tapping the alert brings the game back (or opens it).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => new URL(c.url).origin === self.location.origin);
    if (open) return open.focus();
    return self.clients.openWindow(event.notification.data?.url || '/');
  }));
});
