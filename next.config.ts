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
