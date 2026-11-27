/* Hexagon service worker — generated into dist/sw.js at build time.
 * Scope: the offline app shell, plus come-back reminders. There is no push server: reminders come from the browser's
 * periodic background sync (installed app on Android Chrome), which wakes this worker now and then.
 *  - Precaches every built file so the app opens offline after the first visit.
 *  - Navigations: network-first with cached shell fallback.
 *  - Same-origin assets: cache-first (hashed filenames never change).
 */
const BUILD_ID = __BUILD_ID__;
const CACHE = 'hexagon-shell-' + BUILD_ID;
const PRECACHE = __PRECACHE_MANIFEST__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('hexagon-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
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
          caches.open(CACHE).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./').then((r) => r || caches.match(req))),
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
        }),
    ),
  );
});

// ---- Come-back reminders -------------------------------------------------------------------------------------------
// The app keeps a small plan in the 'hexagon-nudge' cache (the messages for 1, 2, 3, 5, 7 and 14 days away, the last day the
// student studied, and the hour to remind from). When the browser wakes us, we send at most one reminder a day, never at
// night, never the same one twice, and none after two weeks away. Mirrors pickNudge() in src/lib/messages.ts.
const NUDGE_CACHE = 'hexagon-nudge';
const NUDGE_URL = new URL('nudge-plan.json', self.registration.scope).href;

const pad2 = (n) => String(n).padStart(2, '0');
const dayKeyOf = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const dayNumber = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};

async function sendNudge() {
  const cache = await caches.open(NUDGE_CACHE);
  const hit = await cache.match(NUDGE_URL);
  if (!hit) return;
  const plan = await hit.json();
  const now = new Date();
  const today = dayKeyOf(now);
  if (!plan.enabled || now.getHours() < plan.hour || now.getHours() >= 22) return;
  if (plan.sent && plan.sent.on === today) return;
  const gap = dayNumber(today) - dayNumber(plan.anchorDay);
  if (gap < 1 || gap > 16) return;
  const sentDays = plan.sent && plan.sent.anchorDay === plan.anchorDay ? plan.sent.days : 0;
  const due = plan.messages.filter((m) => m.days <= gap && m.days > sentDays);
  if (!due.length) return;
  const msg = due[due.length - 1];
  // Don't interrupt someone who is already looking at the app.
  const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (open.some((c) => c.visibilityState === 'visible')) return;
  await self.registration.showNotification(msg.title, {
    body: msg.body,
    tag: 'hexagon-nudge',
    icon: new URL('icons/icon-192.png', self.registration.scope).href,
    badge: new URL('icons/icon-192.png', self.registration.scope).href,
    data: { url: plan.url },
  });
  plan.sent = { anchorDay: plan.anchorDay, days: msg.days, on: today };
  await cache.put(NUDGE_URL, new Response(JSON.stringify(plan), { headers: { 'content-type': 'application/json' } }));
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'hexagon-nudge') event.waitUntil(sendNudge().catch(() => undefined));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const mine = list.find((c) => c.url.startsWith(self.registration.scope));
      if (mine) {
        if ('navigate' in mine) mine.navigate(url).catch(() => undefined);
        return mine.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
