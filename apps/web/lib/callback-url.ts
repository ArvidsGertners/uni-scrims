export const DEFAULT_AFTER_LOGIN = "/team";

const PROBE_ORIGIN = "http://callback.invalid";

/**
 * Only same-site paths, so the login cannot redirect to another host. Parsed like the browser does:
 * URL parsing strips tabs and newlines, so "/\t/evil.com" would otherwise become "//evil.com".
 */
export function safeCallbackURL(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !value.startsWith("/")) return DEFAULT_AFTER_LOGIN;
  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
  if (url.origin !== PROBE_ORIGIN) return DEFAULT_AFTER_LOGIN;
  return url.pathname + url.search + url.hash;
}
