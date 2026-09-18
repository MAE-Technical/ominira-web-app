import webpush from "web-push";
import { PLATFORM_URL } from "@/lib/config/platform";

let configured = false;

// Configures the module-level webpush singleton exactly once — mirrors
// adminClient.ts's memoized-client pattern, since webpush.setVapidDetails is
// itself global mutable state inside the package.
function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY");
  webpush.setVapidDetails(`mailto:support@${new URL(PLATFORM_URL).hostname}`, publicKey, privateKey);
  configured = true;
}

export function getWebPush() {
  ensureConfigured();
  return webpush;
}
