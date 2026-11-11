// OFFSTEP NOTES · coque en cache : réseau d'abord, repli sur le cache (l'application s'ouvre sans réseau)
const V = 'offstep-notes-v1';
const SHELL = ['./', './index.html', './notes.css', './config.js', './notes-lib.js', './notes-db.js', './notes-queue.js', './notes-editor.js', './notes-list.js', './notes-stock.js', './notes-summary.js', './notes-main.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.hostname.endsWith('supabase.co')) return;                       // les données ne passent jamais par ce cache
  if (u.origin !== location.origin && u.hostname !== 'esm.sh') return;  // esm.sh : la bibliothèque supabase-js doit aussi s'ouvrir hors ligne
  e.respondWith(fetch(r).then((res) => { if (res.ok) { const c = res.clone(); caches.open(V).then((k) => k.put(r, c)); } return res; })
    .catch(() => caches.match(r, { ignoreSearch: true }).then((m) => m || (r.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
