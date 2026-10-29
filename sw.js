// Offline support: keeps the app shell, Firebase SDK and fonts available without a connection.
// Your schedule itself is cached by Firestore (IndexedDB), never here.
// Bump VERSION whenever you change files so devices pick up the new ones.
const VERSION = 'v5';
const SHELL = `schedule-shell-${VERSION}`;
const RUNTIME = `schedule-runtime-${VERSION}`;

const SHELL_FILES = [
  './', 'index.html', 'calendar.html', 'list.html',
  'css/styles.css',
  'js/calendar.js', 'js/dom.js', 'js/editor.js', 'js/firebase-config.js', 'js/firebase.js',
  'js/list.js', 'js/model.js', 'js/search.js', 'js/store.js', 'js/timetable.js', 'js/ui.js', 'js/views.js',
  'icon.svg', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

// Long-lived, versioned third-party files: serve from cache first.
const CACHE_FIRST_HOSTS = ['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, RUNTIME]);
    for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.includes('/data/')) return; // local seed file: never cache personal data
    event.respondWith(networkFirst(req));
  } else if (CACHE_FIRST_HOSTS.includes(url.hostname) && (url.hostname !== 'www.gstatic.com' || url.pathname.startsWith('/firebasejs/'))) {
    event.respondWith(cacheFirst(req));
  }
  // Everything else (Firestore, Google sign-in) goes straight to the network.
});

/** Fresh files when online (so updates show up), cached ones when offline or slow. */
async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    // 'no-cache' revalidates with the server (cheap 304s) so updates aren't hidden by the HTTP cache
    // (navigation requests can't take an init object, so rebuild them from the URL)
    const fresh = req.mode === 'navigate' ? new Request(req.url, { cache: 'no-cache' }) : new Request(req, { cache: 'no-cache' });
    const res = await withTimeout(fetch(fresh), 4000);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
    return Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
