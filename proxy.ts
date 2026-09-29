import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, verifyAdminSession } from "@/lib/admin/pin";

/** PIN gate for every admin page and admin API route (lib/admin/pin.ts). */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/admin/unlock") return NextResponse.next();
  if (await verifyAdminSession(request.cookies.get(ADMIN_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Admin PIN required." }, { status: 401 });
  }
  const unlock = new URL("/admin/unlock", request.url);
  unlock.searchParams.set("next", pathname + search);
  return NextResponse.redirect(unlock);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
