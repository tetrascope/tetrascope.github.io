/* Offline cache for the workbench (network first, cache fallback).
 * GENERATED from tools/sw.template.js by tools/build_definitions.py - do not
 * edit app/sw.js by hand. The cache name embeds the package version and a hash
 * of every cached file, so any change to the app invalidates old caches. */
const CACHE = 'ohara-workbench-0.3.0-eb56aa4253fb';
const SHELL = [
  "./",
  "./cloud.js",
  "./config.js",
  "./csv.js",
  "./datasets.js",
  "./definitions.js",
  "./icon.svg",
  "./index.html",
  "./labels.js",
  "./manifest.webmanifest",
  "./manual.html",
  "./ohara.js",
  "./tetrascope-icon.svg",
  "./tetrascope-logo.svg",
  "./tetrascope_template.csv",
  "./ui.js",
  "./vendor/qrcode-1.0.0.min.js"
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request, {ignoreSearch: true})));
});
