// Client of the OPL API v4 (ARCHITECTURE §5.37): GET by ID only, answers wrapped in `data`. Web and
// bot build it from the env and pass it to the domain functions, which never call fetch themselves.
// Only the fields needed are read; the roster's real names and ages are never touched.
import { z } from "zod";

export const OPL_API_DEFAULT_URL = "https://www.opleague.pro/api/v4";
const TIMEOUT_MS = 5000;

export type OplRateLimit = { remaining: number | null; resetSec: number | null };

export type OplRosterMember = { oplUserId: number; discordId: string | null };

export type OplUserResult = { kind: "found"; discordId: string | null } | { kind: "gone" };

export type OplTeamResult =
  | { kind: "found"; name: string; shortName: string | null; members: OplRosterMember[] }
  | { kind: "gone" };

export type OplResponse<T> = { result: T; rateLimit: OplRateLimit };

export type OplApi = {
  user(id: number): Promise<OplResponse<OplUserResult>>;
  teamRoster(id: number): Promise<OplResponse<OplTeamResult>>;
};

/**
 * A failed call: `auth` for a rejected key (401, 403), `transient` for everything else. Carries only
 * the status, never the body (`/ping` echoes the token, rosters hold personal data).
 */
export class OplError extends Error {
  constructor(
    readonly reason: "auth" | "transient",
    readonly status: number | null,
  ) {
    super(`OPL request failed (${status ?? "no response"})`);
    this.name = "OplError";
  }
}

const discordIdField = z
  .string()
  .regex(/^\d{1,20}$/)
  .nullable()
  .catch(null);

const userSchema = z.object({
  data: z.object({ ID: z.number().int().nullable(), discord_ID: discordIdField }),
});

const rosterEntry = z.object({ ID: z.number().int(), discord_ID: discordIdField });

const teamSchema = z.object({
  data: z.object({
    ID: z.number().int(),
    name: z.string(),
    short_name: z.string().nullable(),
    url: z.string().nullable(),
    // An object keyed by user ID; PHP sends an empty roster as [].
    users: z.union([z.record(z.string(), rosterEntry), z.array(rosterEntry)]),
  }),
});

/**
 * Discord IDs come as 18-digit JSON numbers, beyond Number.MAX_SAFE_INTEGER; JSON.parse would change
 * them. They are turned into strings in the raw text first.
 */
export function quoteDiscordIds(body: string): string {
  return body.replace(/"discord_ID"\s*:\s*(\d+)/g, '"discord_ID":"$1"');
}

function headerNumber(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  if (value === null || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function createOplClient(options: {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}): OplApi {
  const base = (options.baseUrl || OPL_API_DEFAULT_URL).replace(/\/+$/, "");
  const fetchFn = options.fetch ?? globalThis.fetch;

  async function get(
    path: string,
  ): Promise<{ status: number; body: unknown; rateLimit: OplRateLimit }> {
    let response: Response;
    try {
      response = await fetchFn(`${base}/${path}`, {
        headers: { Authorization: `Bearer ${options.apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "error",
      });
    } catch {
      throw new OplError("transient", null);
    }
    const rateLimit = {
      remaining: headerNumber(response.headers, "ratelimit-remaining"),
      resetSec: headerNumber(response.headers, "ratelimit-reset"),
    };
    if (response.status === 401 || response.status === 403) {
      throw new OplError("auth", response.status);
    }
    if (response.status === 404) return { status: 404, body: null, rateLimit };
    if (!response.ok) throw new OplError("transient", response.status);
    try {
      return {
        status: response.status,
        body: JSON.parse(quoteDiscordIds(await response.text())),
        rateLimit,
      };
    } catch {
      throw new OplError("transient", response.status);
    }
  }

  function parse<T extends z.ZodType>(schema: T, body: unknown, status: number): z.output<T> {
    const parsed = schema.safeParse(body);
    // An unexpected shape is OPL's side; the issue is not logged, it may quote the body.
    if (!parsed.success) throw new OplError("transient", status);
    return parsed.data;
  }

  return {
    async user(id) {
      const { status, body, rateLimit } = await get(`user/${id}`);
      if (status === 404) return { result: { kind: "gone" }, rateLimit };
      const { data } = parse(userSchema, body, status);
      if (data.ID !== id) return { result: { kind: "gone" }, rateLimit };
      return { result: { kind: "found", discordId: data.discord_ID }, rateLimit };
    },
    async teamRoster(id) {
      const { status, body, rateLimit } = await get(`team/${id}/users`);
      if (status === 404) return { result: { kind: "gone" }, rateLimit };
      const { data } = parse(teamSchema, body, status);
      // An unknown or deleted team comes with 200, the name "deleted" and the url "/".
      if (data.url === "/" || data.ID !== id) return { result: { kind: "gone" }, rateLimit };
      const members = Object.values(data.users).map((entry) => ({
        oplUserId: entry.ID,
        discordId: entry.discord_ID,
      }));
      return {
        result: { kind: "found", name: data.name, shortName: data.short_name, members },
        rateLimit,
      };
    },
  };
}

/** The client from OPLEAGUE_API_KEY and OPLEAGUE_API_URL; null without a key (linking is off). */
export function oplClientFromEnv(env: NodeJS.ProcessEnv = process.env): OplApi | null {
  const apiKey = env.OPLEAGUE_API_KEY?.trim();
  if (!apiKey) return null;
  return createOplClient({ apiKey, baseUrl: env.OPLEAGUE_API_URL?.trim() || undefined });
}
