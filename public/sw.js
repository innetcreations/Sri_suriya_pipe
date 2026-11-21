/* Service worker: fast repeat visits + offline fallback. Network-first for pages (so edits and festival themes show up immediately),
   cache-first for fingerprinted static assets. Admin and API are never cached. */
const V = 'ssp-v3';
const STATIC = ['/offline.html', '/css/offline.css', '/images/favicon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.origin !== location.origin) return;
  if (/^\/(admin|api|healthz|sw\.js)/.test(u.pathname) || u.pathname.startsWith('/ssp-admin')) return;
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).catch(() => caches.match('/offline.html')));
    return;
  }
  if (/\.(?:css|js|woff2|svg|png|jpe?g|webp|avif|gif)$/.test(u.pathname) || u.pathname.startsWith('/theme/')) {
    e.respondWith(caches.open(V).then((c) => c.match(r).then((hit) => {
      const net = fetch(r).then((res) => { if (res.ok) c.put(r, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })));
  }
});
