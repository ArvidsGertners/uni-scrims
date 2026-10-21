import { isDomainError, requireUser } from "@uni-scrims/core";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth.ts";

export async function getSessionUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

export function loginUrl(callbackURL: string): string {
  return `/login?callbackURL=${encodeURIComponent(callbackURL)}`;
}

/** For pages: logged in and not banned (ARCHITECTURE §7), otherwise redirect. */
export async function requirePageUser(path: string) {
  const userId = await getSessionUserId();
  if (!userId) redirect(loginUrl(path));
  try {
    return await requireUser(userId);
  } catch (error) {
    if (isDomainError(error) && error.code === "BANNED") redirect("/?gesperrt=1");
    if (isDomainError(error) && error.code === "UNAUTHENTICATED") redirect(loginUrl(path));
    throw error;
  }
}
