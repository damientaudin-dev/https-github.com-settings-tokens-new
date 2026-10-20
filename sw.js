/* Le Cercle — service worker : fonctionnement hors ligne (iPad en visite à domicile). */
const VERSION = 'le-cercle-v1';
const CORE = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/store.js', './js/charts.js', './js/emails.js', './js/app.js',
  './assets/logo-upandin.jpg', './assets/icons/icon-180.png', './assets/icons/icon-192.png',
  './assets/icons/icon-512.png', './assets/icons/maskable-512.png', './assets/icons/favicon-32.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Réseau d'abord pour l'application (mises à jour), cache en secours ; cache d'abord pour les polices.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== location.origin && !isFont) return;
  if (isFont) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res;
    })));
    return;
  }
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html'))));
});
