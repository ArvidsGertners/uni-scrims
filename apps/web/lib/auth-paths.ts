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
  // Staff 2FA (§5.9): set up, and the code after the password at login.
  "/two-factor/enable",
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
]);

/** Dev login (dev-login-plugin.ts): the endpoint itself answers 404 outside development. */
const DEV_LOGIN_PATH = "/dev/sign-in";

/**
 * The only endpoints that may create a session for staff (§5.9): the password login (with the 2FA
 * on, Better Auth swaps that session for the code step), the code step, the password change of a
 * signed-in person, and the dev login. Everything else, a Discord login or the link in a mail,
 * would skip the code.
 */
const STAFF_SESSION_PATHS = new Set([
  "/sign-in/email",
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
  "/change-password",
  DEV_LOGIN_PATH,
]);

export function staffSessionAllowed(path: string | undefined): boolean {
  return path !== undefined && STAFF_SESSION_PATHS.has(path);
}

/** Login page errors (?error=) for a refused staff session, by the endpoint that refused it. */
export const STAFF_SESSION_ERRORS = { discord: "staff_discord", link: "staff_link" } as const;

export function staffSessionError(path: string): string {
  return path.startsWith("/callback/") ? STAFF_SESSION_ERRORS.discord : STAFF_SESSION_ERRORS.link;
}

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
