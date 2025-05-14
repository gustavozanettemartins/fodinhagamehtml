const CACHE_NAME = 'fodinha-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/game.js',
  '/img/reverso.png',
  '/sounds/card-play.mp3',
  '/sounds/card-shuffle.mp3',
  '/sounds/guess-sound.mp3',
  '/sounds/round-finished.mp3'
];

// Install service worker and cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Intercept fetch requests and serve from cache when possible
self.addEventListener('fetch', event => {
  // Skip for socket.io requests
  if (event.request.url.includes('socket.io')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached response if found
        if (response) {
          return response;
        }
        // Otherwise try to fetch from network
        return fetch(event.request);
      })
      .catch(() => {
        // For HTML navigation requests, fall back to index page
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return null;
      })
  );
});

// Update cache when new version of service worker is activated
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
}); 