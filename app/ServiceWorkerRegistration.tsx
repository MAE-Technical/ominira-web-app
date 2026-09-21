"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let registration: ServiceWorkerRegistration | null = null;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        registration = reg;
        // Proactively check for a newer sw.js (e.g. after a CACHE_NAME bump)
        // instead of relying solely on the browser's navigation-triggered check,
        // which can be delayed by HTTP caching of sw.js itself.
        reg.update().catch(() => {});
      })
      .catch(() => {});

    const onVisibility = () => {
      if (document.visibilityState === "visible") registration?.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return null;
}
