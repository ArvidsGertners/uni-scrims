// Better Auth serves many endpoints by default (update-user, unlink-account, delete-user and more).
// The app uses only these; every other path answers 404 (ARCHITECTURE §5.1, §5.8), so nobody can
// change the name or the Discord link past core or act past requireUser, banned users included.

/** Reachable over HTTP: OAuth, the session, and the targets of the links in account mails. */
const HTTP_PATHS = new Set([
  "/sign-in/social",
  "/link-social",
  "/sign-out",
  "/get-session",
  "/error",
  "/verify-email",
]);

/**
 * Only for the server actions (§5.8), which validate in core and count attempts first. Called from
 * the server, Better Auth's own rate limiter does not run, so over HTTP these answer 404.
 */
const SERVER_PATHS = new Set([
  "/sign-up/email",
  "/sign-in/email",
  "/send-verification-email",
  "/request-password-reset",
  "/reset-password",
  "/change-password",
  "/change-email",
]);

/** Dev login (dev-login-plugin.ts): the endpoint itself answers 404 outside development. */
const DEV_LOGIN_PATH = "/dev/sign-in";

/**
 * `path` is the Better Auth endpoint path, e.g. "/callback/:id" or "/sign-out"; `fromServer` is true
 * for calls through auth.api, which come without an HTTP request.
 */
export function isAllowedAuthPath(path: string, fromServer: boolean): boolean {
  if (fromServer && SERVER_PATHS.has(path)) return true;
  return (
    HTTP_PATHS.has(path) ||
    path === DEV_LOGIN_PATH ||
    path.startsWith("/callback/") ||
    // The link in the password mail; it only checks the token and redirects to our page.
    path.startsWith("/reset-password/")
  );
}
