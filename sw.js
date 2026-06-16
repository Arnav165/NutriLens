const CACHE = 'nutrilens-v1';
const ASSETS = [
  '/NutriLens/',
  '/NutriLens/index.html',
  '/NutriLens/goals.html',
  '/NutriLens/settings.html',
  '/NutriLens/style.css',
  '/NutriLens/js/app.js',
  '/NutriLens/js/calculations.js',
  '/NutriLens/js/dates.js',
  '/NutriLens/js/gemini.js',
  '/NutriLens/js/nutrients.js',
  '/NutriLens/js/openfoodfacts.js',
  '/NutriLens/js/storage.js',
  '/NutriLens/js/usda.js',
  '/NutriLens/icons/icon-192.png',
  '/NutriLens/icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Only cache same-origin and GitHub Pages requests; let API calls go through
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
