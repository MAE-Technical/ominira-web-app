const CACHE_NAME = "ominira-shell-v8";
// Launch artwork is part of the PWA shell, not page content: it needs to be
// available before a network request can complete on a cold app start. Cache
// both themes because the reader preference is restored client-side.
const APP_SHELL = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
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

// Payload shape is lib/push/send.ts's PushPayload — { title, body, url, tag?, icon?, badge? }.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const payload = event.data.json();
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      // Original Ominira mark (reverted from black-background variant).
      icon: payload.icon || "/icons/icon-192.png",
      badge: payload.badge || "/icons/icon-192.png",
      data: { url: payload.url },
      vibrate: [100, 50, 100],
      timestamp: Date.now(),
      renotify: false,
      requireInteraction: false,
      silent: false,
      actions: [{ action: "open", title: "Open" }],
    })
  );
});

// Focuses the exact destination when it is already open. If the reader is
// open to another place in the same book, navigate that tab first — merely
// focusing it would leave the reader at the wrong note/highlight. Handles
// both the main notification click and the "Open" action button identically.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Action buttons and body clicks both navigate to the same deep link.
  // Unknown actions (if any) still fall through to the main URL.
  const url = new URL(event.notification.data?.url ?? "/", self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => {
        const current = new URL(client.url);
        return current.origin === url.origin && current.pathname === url.pathname && current.search === url.search;
      });
      if (existing) return existing.focus();
      const readerTab = clients.find((client) => {
        const current = new URL(client.url);
        return current.origin === url.origin && current.pathname === url.pathname;
      });
      if (readerTab && "navigate" in readerTab) {
        return readerTab.navigate(url.href).then((client) => client?.focus());
      }
      return self.clients.openWindow(url.href);
    })
  );
});
