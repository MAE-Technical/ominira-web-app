const CACHE_NAME = "ominira-shell-v3";
// Launch artwork is part of the PWA shell, not page content: it needs to be
// available before a network request can complete on a cold app start. Cache
// both themes because the reader preference is restored client-side.
const APP_SHELL = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/images/splash/light-accent.svg",
  "/images/splash/light-illustration-new.svg",
  "/images/splash/dark-accent.svg",
  "/images/splash/dark-illustration-new.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Network-first for navigations (so readers always get fresh content when
// online), falling back to the cached shell only when offline. Everything
// else (audio, fonts, JSON, etc.) passes straight through — this app's
// narration/voice-note data is generated per-session and isn't meant to be
// cached wholesale by a blanket service worker.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  if (APP_SHELL.includes(new URL(request.url).pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
  }
});
