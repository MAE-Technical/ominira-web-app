"use client";

import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/api/client";

// Base64url (VAPID's format) -> the BufferSource pushManager.subscribe expects.
function urlBase64ToUint8Array(base64Url: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
  return bytes.buffer;
}

function isSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

/**
 * Reads current permission/subscription state and exposes `subscribe`,
 * called only from a user gesture (a button tap) — never on mount, since
 * `Notification.requestPermission()` must be triggered by one.
 * `subscribe` posts the endpoint to /api/push/subscription whether or not a
 * reader is logged in yet (see that route's comment); logging in later
 * re-runs this and attaches reader_id via the endpoint upsert.
 */
export function useWebPush() {
  // Lazy initializers so this reads real browser state on first client render
  // without a separate effect — SSR just sees `false`/"default" and the
  // client render (React hydrates with the same `isSupported()` check) picks
  // up the true value with no cascading re-render.
  const [supported] = useState(isSupported);
  const [permission, setPermission] = useState<NotificationPermission>(() => (isSupported() ? Notification.permission : "default"));

  const subscribe = useCallback(async () => {
    if (!isSupported()) return false;
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) throw new Error("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY");

    const permissionResult = await Notification.requestPermission();
    setPermission(permissionResult);
    if (permissionResult !== "granted") return false;

    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }));

    const json = subscription.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
    await apiFetch("/push/subscription", { json: { endpoint: json.endpoint, keys: json.keys } });
    return true;
  }, []);

  const unsubscribe = useCallback(async () => {
    if (!isSupported()) return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await subscription.unsubscribe();
    await apiFetch("/push/subscription", { method: "DELETE", json: { endpoint: subscription.endpoint } });
  }, []);

  return { supported, permission, subscribe, unsubscribe };
}
