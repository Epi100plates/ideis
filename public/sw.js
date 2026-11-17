/* Service worker — powłoka aplikacji offline + cache planu.
   Ten sam schemat co w wersji web; zmień VERSION przy istotnej zmianie plików.

   Powłoka (HTML/CSS/JS/fonty) idzie strategią „cache → sieć w tle”: ikona
   otwiera aplikację z dysku w kilka milisekund, także bez internetu, a nowsza
   wersja pliku dociąga się po cichu do następnego uruchomienia. API planu
   zostaje „sieć → cache”, żeby plan był świeży, gdy sieć jest dostępna. */
'use strict';

const VERSION = 'v40';
const SHELL_CACHE = `plan-android-shell-${VERSION}`;
const API_CACHE = `plan-android-api-${VERSION}`;

const SHELL_ASSETS = [
  '/',
  '/theme-boot.js?v=40',
  '/native.css?v=40',
  '/selection.js?v=40',
  '/wizard.js?v=40',
  '/styles.js?v=40',
  '/schedule.js?v=40',
  '/visit-ping.js?v=40',
  '/app.js?v=40',
  '/fonts/Roboto-latin.woff2',
  '/fonts/Roboto-latin-ext.woff2',
  '/manifest.webmanifest',
  '/icons/icon-192.png?v=40',
  '/icons/icon-512.png?v=40',
  '/icons/apple-touch-icon-180.png?v=40',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Osobno każdy plik: brak jednej ikony nie może wywalić całej instalacji.
    await Promise.all(SHELL_ASSETS.map((asset) => cache.add(asset).catch(() => undefined)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key !== SHELL_CACHE && key !== API_CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

/** Cache → sieć w tle: odpowiedź z dysku od razu, świeża kopia po cichu. */
async function cacheFirst(request, cacheName, fallbackUrl = '') {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  if (cached) return cached;
  // Wejście ze skrótu (`/?view=week`) albo z PWA (`/?source=pwa`) to inny adres
  // niż precache'owane `/` — oddajemy powłokę od razu, bez czekania na sieć.
  if (fallbackUrl) {
    const fallback = await cache.match(fallbackUrl);
    if (fallback) return fallback;
  }
  const fresh = await network;
  if (fresh) return fresh;
  throw new Error('offline');
}

/** Sieć → cache → ewentualnie kopia z cache (offline). */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Załączniki mogą mieć po kilkanaście MB — nie trafiają do Cache Storage.
  if (url.pathname.startsWith('/api/attachments')) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith((async () => {
      try {
        return await networkFirst(request, API_CACHE);
      } catch {
        return new Response(
          JSON.stringify({ ok: false, offline: true, error: 'Brak połączenia — dane z pamięci podręcznej niedostępne.' }),
          { status: 503, headers: { 'content-type': 'application/json; charset=utf-8' } },
        );
      }
    })());
    return;
  }

  // Strony inne niż korzeń (`/licznik`, `/propozycje`) idą wprost do sieci.
  // Cache Storage nie respektuje `no-store`, więc licznik z dysku pokazywałby
  // zamrożoną liczbę, a lista zgłoszeń — wpisy sprzed tygodni.
  if (request.mode === 'navigate' && url.pathname !== '/') return;

  event.respondWith((async () => {
    // Powłokę z cache podajemy tylko dla korzenia (`/?view=…`, `/?source=pwa`).
    const shellFallback = request.mode === 'navigate' && url.pathname === '/' ? '/' : '';
    try {
      return await cacheFirst(request, SHELL_CACHE, shellFallback);
    } catch {
      if (request.mode === 'navigate') {
        const cache = await caches.open(SHELL_CACHE);
        const shell = await cache.match('/');
        if (shell) return shell;
      }
      return new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
  })());
});
