// Mothlight No.01 offline. The app's files are kept on the device and always opened from there, so the app never
// changes under your hands in the middle of a set, and it opens with no internet. It changes only when you tap
// Update now in Help: the page asks this worker to fetch every file again, and only when all of them have arrived are
// they put in place, so a dropped connection part way leaves the old copy whole. Settings, presets and the MIDI map
// are stored separately and are never touched. version.json always comes from the internet, so a check sees the
// newest number.
'use strict';
const CACHE = 'mothlight-app';
const FILES = ['./', 'index.html', 'app.css', 'app.js', 'core.js', 'version.js', 'out-worker.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'fonts/archivo-latin.06fa7831.woff2', 'fonts/jetbrains-mono-500-latin.6c95bc2f.woff2',
  '../isf/signal-solo.fs', '../isf/signal-trails.fs', '../isf/signal-duo.fs', '../isf/signal-colour.fs', '../isf/signal-isf.js'];
const fresh = f => new Request(f, { cache: 'reload' });   // past the browser's own short-term cache

self.addEventListener('install', e => {
  // fill the kept copy only when there is none, so an installed app keeps its version until Update now
  e.waitUntil(caches.open(CACHE).then(c => c.keys().then(k => k.length ? null : c.addAll(FILES.map(fresh)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  // copies from versions before 1.0 were named signal-synth-<version>
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.endsWith('/version.json')) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(fresh(req.url)).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => req.mode === 'navigate' ? caches.match('index.html') : Response.error())));
});

// Update now: every file fetched fresh (the version in the address gets past the web host's own short-term cache),
// then all of them stored together. The reply says whether it worked; on any failure nothing has changed.
self.addEventListener('message', e => {
  if (!e.data || e.data.do !== 'refresh' || !e.ports[0]) return;
  const tag = encodeURIComponent(e.data.version || Date.now());
  e.waitUntil(Promise.all(FILES.map(f => fetch(new Request(f + (f.includes('?') ? '&' : '?') + 'v=' + tag, { cache: 'reload' })).then(res => {
      if (!res.ok) throw new Error(f + ': ' + res.status);
      return [f, res];
    })))
    .then(got => caches.open(CACHE).then(c => Promise.all(got.map(([f, res]) => c.put(new Request(f), res)))))
    .then(() => e.ports[0].postMessage({ ok: true }), err => e.ports[0].postMessage({ ok: false, why: String(err && err.message || err) })));
});
