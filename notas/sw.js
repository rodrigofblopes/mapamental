// abre na hora, mesmo sem sinal: usa o que está guardado e atualiza por trás. As notas (/api/) nunca são guardadas aqui.
const C = 'notas-v5', BASE = ['/notas/', '/notas.js', '/notas/manifest.json', '/notas/icone-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(C).then((c) => c.addAll(BASE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x.startsWith('notas-') && x !== C).map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url); if (e.request.method !== 'GET' || u.pathname.startsWith('/api/')) return;
  const lib = u.hostname === 'cdn.jsdelivr.net'; if (!lib && !(u.origin === location.origin && (u.pathname.startsWith('/notas/') || u.pathname === '/notas.js'))) return;
  const chave = u.pathname === '/notas/' || u.pathname === '/notas/index.html' ? '/notas/' : e.request;
  e.respondWith(caches.open(C).then(async (c) => { const g = await c.match(chave); const rede = fetch(e.request).then((r) => { if (r.ok) c.put(chave, r.clone()); return r; }); if (g) { if (!lib) rede.catch(() => {}); return g; } return rede; }));
});
