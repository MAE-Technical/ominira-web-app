const CACHE_NAME = "ominira-shell-v5";
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

// Payload shape is lib/push/send.ts's PushPayload — { title, body, url, tag? }.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const payload = event.data.json();
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      // The installed PWA mark is deliberately used for both surfaces: it
      // keeps Ominira identifiable in an OS notification tray even when the
      // notification's own title/body contain the interaction emoji.
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url },
    })
  );
});

// Focuses the exact destination when it is already open. If the reader is
// open to another place in the same book, navigate that tab first — merely
// focusing it would leave the reader at the wrong note/highlight.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
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
