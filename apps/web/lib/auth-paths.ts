// Better Auth serves many endpoints by default (update-user, change-email, link-social, delete-user
// and more). The app uses only these; every other path answers 404 (ARCHITECTURE §5.1), so nobody
// can change name or avatar past Discord or act past requireUser, banned users included.
const ALLOWED_AUTH_PATHS = new Set(["/sign-in/social", "/sign-out", "/get-session", "/error"]);

/** Dev login (dev-login-plugin.ts): the endpoint itself answers 404 outside development. */
const DEV_LOGIN_PATH = "/dev/sign-in";

/** `path` is the Better Auth endpoint path, e.g. "/callback/:id" or "/sign-out". */
export function isAllowedAuthPath(path: string): boolean {
  return ALLOWED_AUTH_PATHS.has(path) || path === DEV_LOGIN_PATH || path.startsWith("/callback/");
}
