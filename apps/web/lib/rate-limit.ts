// Per-IP limits for the account actions (ARCHITECTURE §5.8) and team logo uploads (§5.11). Server actions call Better Auth on the
// server, where its own rate limiter does not run, so they count here. One web instance (§6.2), so
// memory is enough; a restart starts over.
import { headers } from "next/headers";
import { actionMessages } from "../i18n/common.ts";
import type { ActionState } from "./action-state.ts";
import { getLocale } from "./locale.ts";

type Rule = { max: number; windowMs: number };

/**
 * Logging in and registering: 5 per minute; requesting a mail: 3 per minute (SPEC N-3). Codes of
 * the staff 2FA, set up and login (§5.9): 10 per minute, as one setup alone takes several, and the
 * plugin locks brute force itself. Team logo uploads (§5.11): 5 per minute, as each costs image work.
 */
export const RATE_LIMITS = {
  login: { max: 5, windowMs: 60_000 },
  register: { max: 5, windowMs: 60_000 },
  mail: { max: 3, windowMs: 60_000 },
  code: { max: 10, windowMs: 60_000 },
  logo: { max: 5, windowMs: 60_000 },
} satisfies Record<string, Rule>;

/** The answer of an action over its limit, in the language of the request (§5.21). */
export async function rateLimited(): Promise<ActionState> {
  return { error: actionMessages[await getLocale()].rateLimited };
}

const hits = new Map<string, number[]>();
/** The longest window; keys with nothing newer are dropped now and then, so the map stays small. */
const MAX_WINDOW_MS = Math.max(...Object.values(RATE_LIMITS).map((rule) => rule.windowMs));
const PRUNE_ABOVE = 10_000;

function prune(now: number) {
  for (const [key, times] of hits) {
    if (times.every((time) => now - time >= MAX_WINDOW_MS)) hits.delete(key);
  }
}

/** Records an attempt; false when the limit for this key is reached. Pure apart from `hits`. */
export function takeAttempt(key: string, rule: Rule, now: number): boolean {
  if (hits.size > PRUNE_ABOVE) prune(now);
  const recent = (hits.get(key) ?? []).filter((time) => now - time < rule.windowMs);
  if (recent.length >= rule.max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

/**
 * The client IP as the proxy sets it: nginx and Caddy overwrite X-Forwarded-For with the address
 * they see (ARCHITECTURE §8), and the web container is not reachable past them.
 */
export async function clientIp(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

/** takeAttempt for the calling request's IP. */
export async function allowAttempt(action: keyof typeof RATE_LIMITS): Promise<boolean> {
  return takeAttempt(`${action}:${await clientIp()}`, RATE_LIMITS[action], Date.now());
}
