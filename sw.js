/* De Letterdief: alle spelbestanden + spraak in één cache, zodat het spel offline werkt. */
'use strict';
const CACHE = 'letterdief-v1.0.0-4336090b46';
const CORE = ['./', './index.html', './style.css', './manifest.webmanifest', './js/game.js', './js/data.js', './js/words.js', './js/learn.js', './js/level.js', './js/engine.js', './js/audio.js', './js/render.js', './js/storage.js', './assets/andika-regular.woff2', './assets/andika-bold.woff2', './assets/icon-180.png', './assets/icon-192.png', './assets/icon-512.png', './audio/manifest.json'];
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await cache.addAll(CORE.map(f => new Request(f, { cache: 'reload' })));
  // Alle spraakfragmenten staan in het manifest; die horen er ook bij (offline!).
  const manifest = await (await cache.match('./audio/manifest.json')).json();
  const files = [...new Set(Object.values(manifest.clips).map(c => './audio/' + c.f))];
  for (let i = 0; i < files.length; i += 40) await cache.addAll(files.slice(i, i + 40).map(f => new Request(f, { cache: 'reload' })));
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil(caches.keys()
  .then(keys => Promise.all(keys.filter(k => k.startsWith('letterdief-') && k !== CACHE).map(k => caches.delete(k))))
  .then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.match(new URL('./index.html', self.registration.scope).href).then(hit => hit || fetch(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then(hit => hit || fetch(event.request)));
});
