import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { sharedCookieDomain } from "./admin-url.ts";
import { FLASH_COOKIE } from "./flash-cookie.ts";

/**
 * Success message for the next render of the page (the design's toast). Server actions only; the
 * toast deletes the cookie once shown. The id lets the same message show again.
 */
export async function setFlash(message: string): Promise<void> {
  (await cookies()).set(
    FLASH_COOKIE,
    `${randomUUID().slice(0, 8)}:${encodeURIComponent(message)}`,
    {
      path: "/",
      maxAge: 60,
      sameSite: "lax",
      // An action on the admin host may lead to the login on the main host (§5.13).
      domain: sharedCookieDomain() ?? undefined,
    },
  );
}

export async function readFlash(): Promise<{ id: string; message: string } | null> {
  const value = (await cookies()).get(FLASH_COOKIE)?.value;
  const separator = value?.indexOf(":") ?? -1;
  if (!value || separator < 0) return null;
  try {
    return {
      id: value.slice(0, separator),
      message: decodeURIComponent(value.slice(separator + 1)),
    };
  } catch {
    return null;
  }
}
