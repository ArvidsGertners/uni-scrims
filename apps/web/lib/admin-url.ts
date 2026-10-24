// Addresses of the admin area (ARCHITECTURE §5.13). With ADMIN_URL it has its own host, where
// proxy.ts rewrites "/bans" to the route /admin/bans; without (development) it stays under /admin.
// Read at call time, so the proxy sees the runtime environment and tests can switch it.

type AdminPath = `/${string}`;

function mainBaseURL(): URL {
  return new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000");
}

/** The admin origin, or null without ADMIN_URL; throws if it is no subdomain of BETTER_AUTH_URL. */
export function adminOrigin(): string | null {
  const value = process.env.ADMIN_URL;
  if (!value) return null;
  const admin = new URL(value);
  const main = mainBaseURL();
  if (!admin.hostname.endsWith(`.${main.hostname}`) || admin.protocol !== main.protocol) {
    throw new Error(`ADMIN_URL ${value} must be a subdomain of BETTER_AUTH_URL ${main.origin}`);
  }
  return admin.origin;
}

/** For links and redirects inside the admin area: "/bans", or "/admin/bans" without ADMIN_URL. */
export function adminHref(path: AdminPath): string {
  if (adminOrigin()) return path;
  return path === "/" ? "/admin" : `/admin${path}`;
}

/** Absolute with ADMIN_URL, for links from the main host and as callbackURL. */
export function adminUrl(path: AdminPath): string {
  const origin = adminOrigin();
  return origin ? `${origin}${path}` : adminHref(path);
}

/** For links from the admin area back to the main host; a plain path without ADMIN_URL. */
export function mainUrl(path: string): string {
  return adminOrigin() ? `${mainBaseURL().origin}${path}` : path;
}

/**
 * Cookie domain for both hosts (the host of BETTER_AUTH_URL), or null without ADMIN_URL: the
 * session and the flash message must survive the way between them.
 */
export function sharedCookieDomain(): string | null {
  return adminOrigin() ? mainBaseURL().hostname : null;
}

/** Whether a request's Host header names the admin host. */
export function isAdminHost(host: string | null): boolean {
  const origin = adminOrigin();
  return origin !== null && host === new URL(origin).host;
}
