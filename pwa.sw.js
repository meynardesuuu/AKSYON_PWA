const CACHE_NAME = 'aksyon-v6';
const urlsToCache = [
  './',
  './index.html',
  './pwa.css',
  './pwa.js',
  './pwa.manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache).catch(err => {
        console.log('Cache addAll error:', err);
      });
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request).then(response => {
        // Don't cache API calls or external resources
        if (event.request.url.includes('supabase') || 
            event.request.url.includes('nominatim') ||
            event.request.url.includes('openstreetmap')) {
          return response;
        }
        
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      }).catch(() => {
        return caches.match('./index.html').then(match => match || caches.match('./'));
      });
    })
  );
});
