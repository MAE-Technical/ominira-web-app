import type { MetadataRoute } from "next";
import { PLATFORM_URL } from "@/lib/config/platform";

// Without this, /robots.txt rendered the HTML not-found page with a 200,
// which link-preview crawlers like Twitterbot may not read as "allow".
// The reader and the API carry book text, so crawlers stay on /library/<slug>
// (database columns plus the manifest). Advisory only; the Vercel Firewall
// and Cloudflare enforce it (bandwidth-spec.md step 3).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/read/", "/reader/"] },
    sitemap: `${PLATFORM_URL}/sitemap.xml`,
  };
}
