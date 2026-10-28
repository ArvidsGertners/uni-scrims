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

export type OplTournament = {
  id: number;
  name: string;
  gameId: number | null;
  ancestors: number[];
  leafes: number[];
};

export type Found<T> = ({ kind: "found" } & T) | { kind: "gone" };

export type OplResponse<T> = { result: T; rateLimit: OplRateLimit };

export type OplApi = {
  user(id: number): Promise<OplResponse<OplUserResult>>;
  teamRoster(id: number): Promise<OplResponse<OplTeamResult>>;
  /** Phase 40 (§5.38): the tournament IDs of an organiser, positive only, newest first. */
  organiserTournaments(id: number): Promise<OplResponse<Found<{ tournamentIds: number[] }>>>;
  tournament(id: number): Promise<OplResponse<Found<{ tournament: OplTournament }>>>;
  /** The teams registered in a tournament, only their IDs (the entries also hold public team data). */
  teamRegistrations(id: number): Promise<OplResponse<Found<{ name: string; teamIds: number[] }>>>;
};

/**
 * A failed call: `auth` for a rejected key (401), `rate` when OPL's limit is used up (429, with the
 * reset from the headers), `transient` for everything else, also a 403 for a single profile or team.
 * Carries only the status, never the body (`/ping` echoes the token, rosters hold personal data).
 */
export class OplError extends Error {
  constructor(
    readonly reason: "auth" | "rate" | "transient",
    readonly status: number | null,
    readonly rateLimit: OplRateLimit | null = null,
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

const intList = z.array(z.number().int());

const organiserSchema = z.object({
  data: z.object({ tournaments: z.array(z.union([z.string(), z.number()])) }),
});

const tournamentSchema = z.object({
  data: z.object({
    ID: z.number().int(),
    name: z.string(),
    game: z.object({ ID: z.number().int() }).nullable().catch(null),
    ancestors: intList,
    leafes: intList,
  }),
});

const registrationEntry = z.object({ ID: z.number().int() });

const registrationsSchema = z.object({
  data: z.object({
    ID: z.number().int(),
    name: z.string(),
    // An object keyed by team ID; an empty list comes as [].
    team_registrations: z.union([
      z.record(z.string(), registrationEntry),
      z.array(registrationEntry),
    ]),
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
    if (response.status === 401) throw new OplError("auth", response.status, rateLimit);
    if (response.status === 429) {
      throw new OplError("rate", response.status, { remaining: 0, resetSec: rateLimit.resetSec });
    }
    if (response.status === 404) return { status: 404, body: null, rateLimit };
    if (!response.ok) throw new OplError("transient", response.status, rateLimit);
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
    async organiserTournaments(id) {
      const { status, body, rateLimit } = await get(`organiser/${id}/tournaments`);
      if (status === 404) return { result: { kind: "gone" }, rateLimit };
      const { data } = parse(organiserSchema, body, status);
      // OPL lists some IDs as negative strings; only the positive ones are tournaments to read.
      const tournamentIds = data.tournaments
        .map(Number)
        .filter((value) => Number.isSafeInteger(value) && value > 0)
        .sort((a, b) => b - a);
      return { result: { kind: "found", tournamentIds }, rateLimit };
    },
    async tournament(id) {
      const { status, body, rateLimit } = await get(`tournament/${id}`);
      if (status === 404) return { result: { kind: "gone" }, rateLimit };
      const { data } = parse(tournamentSchema, body, status);
      if (data.ID !== id) return { result: { kind: "gone" }, rateLimit };
      const tournament = {
        id: data.ID,
        name: data.name,
        gameId: data.game?.ID ?? null,
        ancestors: data.ancestors,
        leafes: data.leafes,
      };
      return { result: { kind: "found", tournament }, rateLimit };
    },
    async teamRegistrations(id) {
      const { status, body, rateLimit } = await get(`tournament/${id}/team_registrations`);
      if (status === 404) return { result: { kind: "gone" }, rateLimit };
      const { data } = parse(registrationsSchema, body, status);
      if (data.ID !== id) return { result: { kind: "gone" }, rateLimit };
      const teamIds = Object.values(data.team_registrations).map((entry) => entry.ID);
      return { result: { kind: "found", name: data.name, teamIds }, rateLimit };
    },
  };
}

/** The client from OPLEAGUE_API_KEY and OPLEAGUE_API_URL; null without a key (linking is off). */
export function oplClientFromEnv(env: NodeJS.ProcessEnv = process.env): OplApi | null {
  const apiKey = env.OPLEAGUE_API_KEY?.trim();
  if (!apiKey) return null;
  return createOplClient({ apiKey, baseUrl: env.OPLEAGUE_API_URL?.trim() || undefined });
}
