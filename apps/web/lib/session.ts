import {
  getCurrentUser,
  isDomainError,
  requireAccountUser,
  requireAdmin,
  requireUser,
} from "@uni-scrims/core";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
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

/** For admin pages: requirePageUser plus requireAdmin from core; non-admins get a 404. */
export async function requireAdminPage(path: string) {
  const user = await requirePageUser(path);
  try {
    return await requireAdmin(user.id);
  } catch (error) {
    if (isDomainError(error) && error.code === "FORBIDDEN") notFound();
    throw error;
  }
}
