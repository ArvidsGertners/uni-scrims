import {
  STAFF_AREAS,
  type StaffArea,
  getAdminOverview,
  getCurrentUser,
  isDomainError,
  requireAccountUser,
  requireStaff,
  requireStaffMember,
  requireUser,
} from "@uni-scrims/core";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { adminHref, adminUrl, mainUrl } from "./admin-url.ts";
import { auth } from "./auth.ts";

export async function getSessionUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

/**
 * The session's user for header and landing page, or null. Also null for a session that is left of a
 * deleted account (§5.1), so it shows the login instead of looping between login and page.
 */
export async function getSignedInUser() {
  const userId = await getSessionUserId();
  return userId ? getCurrentUser(userId) : null;
}

export function loginUrl(callbackURL: string): string {
  return `/login?callbackURL=${encodeURIComponent(callbackURL)}`;
}

/** Where an incomplete account finishes its setup (§5.8), coming back to `path` afterwards. */
export function setupUrl(path: string): string {
  return `/account/setup?callbackURL=${encodeURIComponent(path)}`;
}

/**
 * For pages: logged in, not banned and with a complete account (ARCHITECTURE §7, §5.8), otherwise
 * redirect.
 */
export async function requirePageUser(path: string) {
  const userId = await getSessionUserId();
  if (!userId) redirect(loginUrl(path));
  try {
    return await requireUser(userId);
  } catch (error) {
    if (isDomainError(error) && error.code === "BANNED") redirect("/?gesperrt=1");
    if (isDomainError(error) && error.code === "UNAUTHENTICATED") redirect(loginUrl(path));
    if (isDomainError(error) && error.code === "ACCOUNT_INCOMPLETE") redirect(setupUrl(path));
    throw error;
  }
}

/** For /account: logged in, banned users and incomplete accounts included (§7), otherwise redirect. */
export async function requirePageAccountUser(path: string) {
  const userId = await getSessionUserId();
  if (!userId) redirect(loginUrl(path));
  try {
    return await requireAccountUser(userId);
  } catch (error) {
    if (isDomainError(error) && error.code === "UNAUTHENTICATED") redirect(loginUrl(path));
    throw error;
  }
}

/** The login on the main host, back to this page of the admin area afterwards (§5.13). */
export function adminLoginUrl(path: `/${string}`): string {
  return mainUrl(loginUrl(adminUrl(path)));
}

/**
 * Without a session to the login; banned, incomplete and accounts without a role get a 404, so the
 * admin area stays invisible. requirePageUser's redirects would loop on the admin host (§5.13).
 */
function adminPageProblem(error: unknown, path: `/${string}`): never {
  if (isDomainError(error) && error.code === "UNAUTHENTICATED") redirect(adminLoginUrl(path));
  if (isDomainError(error) && error.code === "TWO_FACTOR_REQUIRED") redirect(adminHref("/2fa"));
  if (isDomainError(error) && ADMIN_HIDDEN.has(error.code)) notFound();
  throw error;
}

const ADMIN_HIDDEN = new Set(["BANNED", "ACCOUNT_INCOMPLETE", "FORBIDDEN"]);

/**
 * For admin pages: a role that may use `area`, with 2FA (§5.9). Without 2FA to the setup. `path`
 * is the page inside the admin area, e.g. "/bans".
 */
export async function requireStaffPage(path: `/${string}`, area: StaffArea) {
  const userId = await getSessionUserId();
  if (!userId) redirect(adminLoginUrl(path));
  try {
    return await requireStaff(userId, STAFF_AREAS[area]);
  } catch (error) {
    adminPageProblem(error, path);
  }
}

/**
 * Admin pages with their frame (§5.14): requireStaffPage and the data of sidebar and overview,
 * under the same handling, so a role removed meanwhile still ends in a 404, not an error page.
 */
export async function requireAdminShellPage(path: `/${string}`, area: StaffArea) {
  const staff = await requireStaffPage(path, area);
  try {
    return { staff, overview: await getAdminOverview({ staffId: staff.id, now: new Date() }) };
  } catch (error) {
    adminPageProblem(error, path);
  }
}

/** For the admin layout and the 2FA setup: any role, 2FA not needed yet (§5.9). */
export async function requireStaffMemberPage(path: `/${string}`) {
  const userId = await getSessionUserId();
  if (!userId) redirect(adminLoginUrl(path));
  try {
    return await requireStaffMember(userId);
  } catch (error) {
    adminPageProblem(error, path);
  }
}
