const CACHE_NAME = 'clab-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles/main.css',
  '/other/script.js',
  '/pictures/calendar.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
