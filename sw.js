// =====================================================
// Mi Álbum Mundial 2026 — Service Worker
// Incrementar CACHE_VER con cada deploy importante
// =====================================================
const CACHE_VER   = 'v3';
const CACHE_MAIN  = 'album-mundial-2026-' + CACHE_VER;
const CACHE_FONTS = 'album-mundial-2026-fonts-' + CACHE_VER;

// Archivos propios + CDN scripts → se pre-cachean en install
const STATIC_ASSETS = [
  '/album-mundial-2026/',
  '/album-mundial-2026/index.html',
  '/album-mundial-2026/manifest.json',
  '/album-mundial-2026/sw.js',
  '/album-mundial-2026/icon-192.png',
  '/album-mundial-2026/icon-512.png',
  // CDN scripts (se cachean para uso offline)
  'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
];

// ── Install: pre-cachear todo lo estático ──────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_MAIN)
      .then(c => c.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: limpiar caches viejos ────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_MAIN && k !== CACHE_FONTS)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: estrategia por tipo de recurso ──────────
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Solo GET
  if (e.request.method !== 'GET') return;

  // Firebase / Vision API → siempre red, nunca cachear
  if (
    url.includes('firebaseio.com') ||
    url.includes('googleapis.com/v1/images') ||
    url.includes('firebasestorage') ||
    url.includes('wa.me')
  ) return;

  // Google Fonts CSS y archivos .woff2 → Cache First
  // (las fuentes no cambian; si están en caché las servimos al instante)
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.open(CACHE_FONTS).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(resp => {
            if (resp && resp.status === 200) cache.put(e.request, resp.clone());
            return resp;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  // Todo lo demás (app + CDN scripts) → Stale-While-Revalidate
  // Sirve lo cacheado de inmediato y actualiza en background
  e.respondWith(
    caches.open(CACHE_MAIN).then(cache =>
      cache.match(e.request).then(cached => {
        const networkFetch = fetch(e.request).then(resp => {
          if (resp && resp.status === 200) {
            // Cachear respuestas propias + CDN conocidos
            const isCacheable =
              url.startsWith(self.location.origin) ||
              url.includes('cdnjs.cloudflare.com') ||
              url.includes('jsdelivr.net');
            if (isCacheable) cache.put(e.request, resp.clone());
          }
          return resp;
        }).catch(() => cached); // sin red → usar caché
        return cached || networkFetch;
      })
    )
  );
});
