// The admin area on its own host (ARCHITECTURE §5.13). Only routing: pages and actions check the
// role themselves (§7).
import { type NextRequest, NextResponse } from "next/server";
import { adminOrigin, isAdminHost } from "./lib/admin-url.ts";

// Legal pages and support are reachable on the admin host too (its footer links them, §5.16).
const ADMIN_HOST_PASSTHROUGH = new Set(["/impressum", "/datenschutz", "/support"]);

/** "/admin/bans" → "/bans", "/admin" → "/", anything else null. */
function withoutAdminPrefix(pathname: string): string | null {
  if (pathname === "/admin") return "/";
  return pathname.startsWith("/admin/") ? pathname.slice("/admin".length) : null;
}

/** Always on the admin host: the path is set, not joined, so "//host" stays a path. */
function adminRedirect(origin: string, pathname: string, search: string) {
  const url = new URL(origin);
  url.pathname = pathname;
  url.search = search;
  return NextResponse.redirect(url);
}

export function proxy(request: NextRequest) {
  const origin = adminOrigin();
  if (!origin) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  const stripped = withoutAdminPrefix(pathname);

  if (isAdminHost(request.headers.get("host"))) {
    if (stripped !== null) return adminRedirect(origin, stripped, search);
    if (ADMIN_HOST_PASSTHROUGH.has(pathname)) return NextResponse.next();
    // Also server action POSTs and RSC requests, so the admin pages work as before.
    const target = request.nextUrl.clone();
    target.pathname = pathname === "/" ? "/admin" : `/admin${pathname}`;
    return NextResponse.rewrite(target);
  }
  if (stripped !== null) return adminRedirect(origin, stripped, search);
  return NextResponse.next();
}

export const config = {
  // Not for build output, API routes (the upload preview checks the role itself) and public files.
  matcher: ["/((?!_next/|api/|.*\\.[^/]+$).*)"],
};
