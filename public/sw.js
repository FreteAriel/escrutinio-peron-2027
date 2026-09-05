const CACHE = 'escrutinio-v1';
const STATIC = ['/', '/manifest.json'];

// Instalar: cachear archivos estáticos
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

// Activar: limpiar caches viejos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first para estáticos, network-first para API
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API: siempre intentar red primero
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request)
        .catch(() => new Response(JSON.stringify({ error: 'Sin conexión', offline: true }), {
          headers: { 'Content-Type': 'application/json' }
        }))
    );
    return;
  }

  // Estáticos: cache first, fallback a red
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match('/'));
    })
  );
});

// Background sync: reenviar mesas pendientes cuando vuelve la conexión
self.addEventListener('sync', e => {
  if (e.tag === 'sync-mesas') {
    e.waitUntil(syncPending());
  }
});

async function syncPending() {
  // Notificar a todos los clientes para que hagan sync
  const clients = await self.clients.matchAll();
  clients.forEach(c => c.postMessage({ type: 'SYNC_NOW' }));
}
