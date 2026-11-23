// Mothlight No.01 offline. The app's files are kept on the device and always opened from there, so the app never
// changes under your hands in the middle of a set, and it opens with no internet. It changes only when you tap
// Update now in Help: the page asks this worker to fetch every file again, and only when all of them have arrived are
// they put in place, so a dropped connection part way leaves the old copy whole. Settings, presets and the MIDI map
// are stored separately and are never touched. version.json always comes from the internet, so a check sees the
// newest number.
'use strict';
// Renamed in 1.0.1 (it was mothlight-app). 1.0 went out for a few minutes with the old app page beside the new code;
// a copy kept then cannot start. A new name makes every browser fetch one fresh, whole copy by itself, once.
const CACHE = 'mothlight-1';
const FILES = ['./', 'index.html', 'app.css', 'app.js', 'core.js', 'version.js', 'out-worker.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'fonts/archivo-latin.06fa7831.woff2', 'fonts/jetbrains-mono-500-latin.6c95bc2f.woff2',
  '../isf/signal-solo.fs', '../isf/signal-trails.fs', '../isf/signal-duo.fs', '../isf/signal-colour.fs', '../isf/signal-isf.js'];

// The version on the internet now, so every file can be asked for by it: the web host keeps files for a few minutes,
// and asking by version gets past that, so old and new files never mix in one copy.
const versionNow = () => fetch('version.json?t=' + Date.now(), { cache: 'no-store' })
  .then(r => r.ok ? r.json() : {}).then(v => String(v.version || Date.now()), () => String(Date.now()));
// every file for one version, all or nothing: any failure and nothing is stored
function fetchAll(tag) {
  return Promise.all(FILES.map(f => fetch(new Request(f + '?v=' + encodeURIComponent(tag), { cache: 'reload' })).then(res => {
    if (!res.ok) throw new Error(f + ': ' + res.status);
    return [f, res];
  })));
}
const store = got => caches.open(CACHE).then(c => Promise.all(got.map(([f, res]) => c.put(new Request(f), res))));

self.addEventListener('install', e => {
  // fill the kept copy only when there is none, so an installed app keeps its version until Update now
  e.waitUntil(caches.open(CACHE).then(c => c.keys()).then(k => k.length ? null : versionNow().then(fetchAll).then(store)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  // copies from before: mothlight-app (1.0) and signal-synth-<version> (before 1.0)
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.endsWith('/version.json')) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(new Request(req.url, { cache: 'reload' })).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => req.mode === 'navigate' ? caches.match('index.html') : Response.error())));
});

// Update now and Fetch the app again: every file fetched by version, then all of them stored together.
// The reply says whether it worked; on any failure nothing has changed.
self.addEventListener('message', e => {
  if (!e.data || e.data.do !== 'refresh' || !e.ports[0]) return;
  e.waitUntil(fetchAll(String(e.data.version || Date.now())).then(store)
    .then(() => e.ports[0].postMessage({ ok: true }), err => e.ports[0].postMessage({ ok: false, why: String(err && err.message || err) })));
});
