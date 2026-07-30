/* ============================================
   MiPlata — Service Worker (Cache-First)
   ============================================ */

const CACHE_VERSION = 'miplata-v26';

// Detect base path dynamically (works on GitHub Pages, Vercel, Netlify, etc.)
const BASE = self.registration.scope;

const STATIC_FILES = [
  '',
  'index.html',
  'styles.css',
  'app.js',
  'db.js',
  'ocr.js',
  'charts.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js'
];

// ── Install: precache all static assets ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      // Cache local assets (resolve relative to scope)
      const urls = STATIC_FILES.map(f => new URL(f, BASE).href);
      await cache.addAll(urls);
      // Try to cache CDN assets (non-blocking)
      for (const url of CDN_ASSETS) {
        try {
          await cache.add(url);
        } catch (e) {
          console.warn('[SW] Could not cache CDN asset:', url);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first, network fallback ──
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Handle Web Share Target POST request
  if (request.method === 'POST' && request.url.includes('?shared=true')) {
    event.respondWith((async () => {
      try {
        const formData = await request.formData();
        const file = formData.get('receipt');
        if (file) {
          const cache = await caches.open('shared-data');
          await cache.put(new URL('shared-image', BASE).href, new Response(file));
        }
      } catch (err) {
        console.error('[SW] Share target error:', err);
      }
      // Redirect to the main app with the shared parameter
      return Response.redirect(new URL('?shared=1', BASE).href, 303);
    })());
    return;
  }

  // Skip other non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) requests
  if (!request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        // Cache successful responses
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (request.destination === 'document') {
          return caches.match(new URL('index.html', BASE).href);
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      });
    })
  );
});