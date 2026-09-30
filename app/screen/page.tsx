import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AppSplashScreen from "@/app/components/pwa/AppSplashScreen";

export const metadata: Metadata = {
  title: "Splash screen",
  robots: { index: false, follow: false },
};

/**
 * Design review for the PWA launch splash: the real AppSplashScreen, held on
 * screen (`persist`) instead of fading after launch. It follows the current
 * theme — switch it anywhere in the app, then come back. Local dev only.
 */
export default function SplashScreenPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AppSplashScreen persist />;
}
