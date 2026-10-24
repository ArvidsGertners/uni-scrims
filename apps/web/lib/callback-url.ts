import { adminOrigin } from "./admin-url.ts";

export const DEFAULT_AFTER_LOGIN = "/team";

const PROBE_ORIGIN = "http://callback.invalid";

/**
 * Only same-site paths, so the login cannot redirect to another host, and absolute addresses of the
 * admin host, which leads to the login on the main host (§5.13). Parsed like the browser does: URL
 * parsing strips tabs and newlines, so "/\t/evil.com" would otherwise become "//evil.com".
 */
export function safeCallbackURL(value: string | string[] | undefined): string {
  if (typeof value !== "string") return DEFAULT_AFTER_LOGIN;
  if (!value.startsWith("/")) return adminCallbackURL(value) ?? DEFAULT_AFTER_LOGIN;
  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
  if (url.origin !== PROBE_ORIGIN) return DEFAULT_AFTER_LOGIN;
  return url.pathname + url.search + url.hash;
}

function adminCallbackURL(value: string): string | null {
  const origin = adminOrigin();
  if (!origin) return null;
  try {
    const url = new URL(value);
    return url.origin === origin ? url.href : null;
  } catch {
    return null;
  }
}
