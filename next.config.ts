import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // `ws` (lib/audio/engines/edge.ts) has optional native addons
  // (bufferutil/utf-8-validate) for performance — left external so it's
  // `require()`d from node_modules at request time like any other
  // server-only dependency, rather than risking Turbopack's dev bundling
  // mishandling it the way it did the isomorphic package this used to go
  // through (see edge.ts's own doc comment).
  serverExternalPackages: ["ws"],
  // /reading became /shelf once it stopped being just the in-progress list
  // and grew Saved/Finished tabs (see ShelfView). Permanent, and kept
  // indefinitely rather than treated as a migration window: the old path is
  // sitting in installed PWAs' caches and in whatever readers bookmarked in
  // their own browsers, neither of which we can go and rewrite.
  async redirects() {
    return [
      { source: "/reading", destination: "/shelf", permanent: true },
      // Superseded icon URLs. Already-sent announcement emails and installed
      // PWAs holding a stale manifest still request these.
      { source: "/icons/icon-192.png", destination: "/icons/icon-192x192.png", permanent: true },
      { source: "/icons/icon-512.png", destination: "/icons/icon-512x512.png", permanent: true },
      { source: "/icon.png", destination: "/icons/icon-512x512.png", permanent: true },
      { source: "/apple-icon.png", destination: "/icons/apple-touch-icon-180x180.png", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
  experimental: {
    // Next 15+ defaults dynamic routes' client-side Router Cache to 0 —
    // every single tap on a bottom-nav/sidebar link re-fetches that route's
    // RSC payload from scratch, even the *second* it's tapped again, even
    // though (app)/loading.tsx's Suspense boundary already covers the wait
    // visually. That's what made switching tabs (home <-> library <->
    // account) feel like it never got faster no matter how many times you'd
    // already visited this session. 30s (Next 14's own old default) means a
    // revisit within that window is served straight from the client cache —
    // instant, no network round trip — while still refetching soon enough
    // that nothing goes meaningfully stale for a reader bouncing between
    // tabs. Static routes already default to 300s; left as-is.
    staleTimes: {
      dynamic: 30,
    },
  },
};

export default nextConfig;
