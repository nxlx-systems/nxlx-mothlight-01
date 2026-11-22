// Mothlight No.01 offline: every file the app needs is kept on the device. The app's own files are fetched fresh when
// the network is there and taken from the device when it is not. The fonts are part of the app, so nothing comes from elsewhere.
'use strict';
importScripts('version.js');
// The offline copy is named after version.js. This file changes with every version too (0.5.1), so every browser
// is sure to see a new offline worker and fetch the new files.
const CACHE = 'signal-synth-' + self.SIGNAL_VERSION;
const FILES = ['./', 'index.html', 'app.css', 'app.js', 'core.js', 'version.js', 'out-worker.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'fonts/archivo-latin.06fa7831.woff2', 'fonts/jetbrains-mono-500-latin.6c95bc2f.woff2',
  '../isf/signal-solo.fs', '../isf/signal-trails.fs', '../isf/signal-duo.fs', '../isf/signal-colour.fs', '../isf/signal-isf.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // fresh when it can be, kept when it cannot
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  }
});
