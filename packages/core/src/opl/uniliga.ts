// The Uniliga league of linked teams (SPEC N-36, ARCHITECTURE §5.38). A run walks down from the
// Uniliga's tournament list to the current VALORANT season and reads the registrations of its group
// stage, one OPL call per step; the OPL loop takes a due step before any link check. Only OPL team
// IDs with league and group are stored, no personal data.
import { Prisma, prisma } from "@uni-scrims/db";
import type { Db } from "../db.ts";
import { type OplApi, OplError, type OplRateLimit } from "./client.ts";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** The Uniliga as OPL organiser. */
export const UNILIGA_ORGANISER_ID = 3;
/** OPL's game ID of VALORANT. */
export const UNILIGA_GAME_ID = 2;
/** Only teams in this stage get a league (decision of the user, SPEC N-36). */
export const UNILIGA_LEAGUE_STAGE = "Gruppenphase";
/** A new run starts this long after the last successful one began: data at most about 12 h old. */
export const UNILIGA_CRAWL_INTERVAL_HOURS = 11;
/** How many of the newest tournaments of the Uniliga are looked at for a season. */
export const UNILIGA_ROOT_LIMIT = 12;
/** After a failed call the step is tried again after this long; the third failure ends the run. */
const STEP_RETRY_MS = 10 * MINUTE;
const STEP_FAILURE_LIMIT = 3;
/** A failed run is followed by a new one after this long. */
const FAILED_RETRY_MS = HOUR;

export type League = { division: number; group: string | null };

type Season = { id: number; name: string };

/** Where a run stands; stored as JSON in OplCrawl.cursor. */
export type CrawlCursor =
  | { step: "organiser"; failures: number }
  | { step: "roots"; roots: number[]; failures: number }
  | {
      step: "leaves";
      roots: number[];
      season: Season;
      leaves: number[];
      found: number;
      failures: number;
    }
  | { step: "done" };

export type CrawlStepResult = { checked: boolean; rateLimit: OplRateLimit | null };

/**
 * The league of a tournament leaf, from its name: OPL builds names as "<parent> - <part>", so a leaf
 * of the group stage starts with "<season> - Gruppenphase - ". The league reads "1. Liga" or
 * "Liga 1", the group (optional) "Gruppe A". Null for any other leaf. Pure.
 */
export function parseLeague(seasonName: string, leafName: string): League | null {
  const prefix = `${seasonName} - ${UNILIGA_LEAGUE_STAGE} - `;
  if (!leafName.startsWith(prefix)) return null;
  const rest = leafName.slice(prefix.length);
  const league = /(?:^|[\s-])(\d{1,2})\.\s*Liga\b|\bLiga\s+(\d{1,2})\b/i.exec(rest);
  if (!league) return null;
  const division = Number(league[1] ?? league[2]);
  if (division < 1) return null;
  const group = /\bGruppe\s+([^\s-]{1,10})/i.exec(rest);
  return { division, group: group ? group[1]!.toUpperCase() : null };
}

/** The chosen leagues that the current season has, without duplicates, in order. Pure. */
export function chosenLeagues(
  chosen: readonly number[] | null | undefined,
  options: readonly number[],
): number[] {
  if (!chosen?.length) return [];
  const known = new Set(options);
  return [...new Set(chosen)].filter((division) => known.has(division)).sort((a, b) => a - b);
}

function isSeason(tournament: {
  id: number;
  gameId: number | null;
  ancestors: number[];
  leafes: number[];
}): boolean {
  return (
    tournament.gameId === UNILIGA_GAME_ID &&
    tournament.ancestors.length === 0 &&
    tournament.leafes.length > 1 &&
    !tournament.leafes.includes(tournament.id)
  );
}

/**
 * The run to take a step of now: the open one once its wait is over, else a new one when the last
 * successful run began 11 h ago (1 h after a failed one). Null when nothing is due.
 */
async function dueCrawl(now: Date): Promise<{ id: string; cursor: CrawlCursor } | null> {
  const open = await prisma.oplCrawl.findFirst({
    where: { finishedAt: null },
    orderBy: { startedAt: "asc" },
    select: { id: true, cursor: true, nextStepAt: true },
  });
  if (open) {
    return open.nextStepAt <= now ? { id: open.id, cursor: open.cursor as CrawlCursor } : null;
  }
  const last = await prisma.oplCrawl.findFirst({
    orderBy: { startedAt: "desc" },
    select: { startedAt: true, finishedAt: true, failed: true },
  });
  if (last) {
    const nextAt = last.failed
      ? last.finishedAt!.getTime() + FAILED_RETRY_MS
      : last.startedAt.getTime() + UNILIGA_CRAWL_INTERVAL_HOURS * HOUR;
    if (nextAt > now.getTime()) return null;
  }
  const cursor: CrawlCursor = { step: "organiser", failures: 0 };
  const created = await prisma.oplCrawl.create({
    data: { startedAt: now, nextStepAt: now, cursor },
    select: { id: true },
  });
  return { id: created.id, cursor };
}

/**
 * Takes one step of a due run (one OPL call) and returns null when no run is due. Throws an OplError
 * with reason "auth" without writing; on a used-up limit (429) nothing is written and the result
 * carries OPL's reset.
 */
export async function uniligaTick(input: {
  now: Date;
  opl: OplApi;
}): Promise<CrawlStepResult | null> {
  const crawl = await dueCrawl(input.now);
  if (!crawl) return null;
  return crawlStep({ ...input, crawl });
}

type Outcome = {
  cursor: CrawlCursor;
  rows?: { oplTeamId: number; leafId: number; division: number; group: string | null }[];
};

/** The cursor after a step, with empty lists resolved: a season without teams falls back to the
 * next older root, no roots left ends the run. */
function settle(cursor: CrawlCursor): CrawlCursor {
  if (cursor.step === "leaves" && cursor.leaves.length === 0) {
    if (cursor.found > 0) return { step: "done" };
    return settle({ step: "roots", roots: cursor.roots, failures: 0 });
  }
  if (cursor.step === "roots" && cursor.roots.length === 0) return { step: "done" };
  return cursor;
}

/** One step of the run: one OPL call, then the new cursor (and rows) in one transaction. */
export async function crawlStep(input: {
  now: Date;
  opl: OplApi;
  crawl: { id: string; cursor: CrawlCursor };
}): Promise<CrawlStepResult> {
  const { now, opl, crawl } = input;
  const cursor = crawl.cursor;
  if (cursor.step === "done") {
    await finish(crawl.id, now, cursor);
    return { checked: false, rateLimit: null };
  }
  let outcome: Outcome;
  let rateLimit: OplRateLimit;
  try {
    ({ outcome, rateLimit } = await callStep(opl, cursor));
  } catch (error) {
    if (!(error instanceof OplError) || error.reason === "auth") throw error;
    if (error.reason === "transient") await stepFailed(crawl.id, now, cursor);
    return { checked: true, rateLimit: error.rateLimit };
  }
  const next = settle(outcome.cursor);
  if (next.step === "done") {
    await finish(crawl.id, now, next, outcome.rows);
  } else {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.oplCrawl.updateMany({
        where: { id: crawl.id, finishedAt: null },
        data: { cursor: next, nextStepAt: now },
      });
      if (updated.count === 0) return;
      await writeRows(tx, crawl.id, outcome.rows);
    });
  }
  return { checked: true, rateLimit };
}

async function callStep(
  opl: OplApi,
  cursor: Exclude<CrawlCursor, { step: "done" }>,
): Promise<{ outcome: Outcome; rateLimit: OplRateLimit }> {
  if (cursor.step === "organiser") {
    const { result, rateLimit } = await opl.organiserTournaments(UNILIGA_ORGANISER_ID);
    // Without the list the run can't know the season; it fails like any call, never ends empty.
    if (result.kind === "gone") throw new OplError("transient", 404, rateLimit);
    const roots = result.tournamentIds.slice(0, UNILIGA_ROOT_LIMIT);
    return { outcome: { cursor: { step: "roots", roots, failures: 0 } }, rateLimit };
  }
  if (cursor.step === "roots") {
    const [id, ...roots] = cursor.roots;
    const { result, rateLimit } = await opl.tournament(id!);
    if (result.kind === "found" && isSeason(result.tournament)) {
      const { tournament } = result;
      const season = { id: tournament.id, name: tournament.name };
      return {
        outcome: {
          cursor: {
            step: "leaves",
            roots,
            season,
            leaves: tournament.leafes,
            found: 0,
            failures: 0,
          },
        },
        rateLimit,
      };
    }
    return { outcome: { cursor: { step: "roots", roots, failures: 0 } }, rateLimit };
  }
  const [leafId, ...leaves] = cursor.leaves;
  const { result, rateLimit } = await opl.teamRegistrations(leafId!);
  const league = result.kind === "found" ? parseLeague(cursor.season.name, result.name) : null;
  const teamIds = league && result.kind === "found" ? [...new Set(result.teamIds)] : [];
  const rows = teamIds.map((oplTeamId) => ({ oplTeamId, leafId: leafId!, ...league! }));
  return {
    outcome: {
      cursor: { ...cursor, leaves, found: cursor.found + rows.length, failures: 0 },
      rows,
    },
    rateLimit,
  };
}

async function writeRows(tx: Prisma.TransactionClient, crawlId: string, rows: Outcome["rows"]) {
  if (!rows?.length) return;
  // A team in two groups of the same run keeps the first.
  await tx.uniligaRegistration.createMany({
    data: rows.map((row) => ({ crawlId, ...row })),
    skipDuplicates: true,
  });
}

/** A failed call: the step waits 10 min; the third failure in a row ends the run as failed, and the
 * last successful run stays shown (a half run never falls back to an older season). */
async function stepFailed(
  crawlId: string,
  now: Date,
  cursor: Exclude<CrawlCursor, { step: "done" }>,
) {
  const failures = cursor.failures + 1;
  if (failures < STEP_FAILURE_LIMIT) {
    await prisma.oplCrawl.updateMany({
      where: { id: crawlId, finishedAt: null },
      data: {
        cursor: { ...cursor, failures },
        nextStepAt: new Date(now.getTime() + STEP_RETRY_MS),
      },
    });
    return;
  }
  await prisma.$transaction(async (tx) => {
    const updated = await tx.oplCrawl.updateMany({
      where: { id: crawlId, finishedAt: null },
      data: { finishedAt: now, failed: true, cursor: { ...cursor, failures } },
    });
    if (updated.count === 0) return;
    await tx.uniligaRegistration.deleteMany({ where: { crawlId } });
  });
}

/**
 * A run through: shown from now on if it found teams, and older runs with their registrations go.
 * A run without any team (no season with groups among the newest tournaments, or OPL answering 404
 * for all of them) keeps the last run with teams shown (SPEC N-36: the last complete state stays).
 */
async function finish(crawlId: string, now: Date, cursor: CrawlCursor, rows?: Outcome["rows"]) {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.oplCrawl.updateMany({
      where: { id: crawlId, finishedAt: null },
      data: { finishedAt: now, cursor },
    });
    if (updated.count === 0) return;
    await writeRows(tx, crawlId, rows);
    const shown = await shownCrawlId(tx);
    await tx.oplCrawl.deleteMany({
      where: { id: { notIn: [crawlId, ...(shown ? [shown] : [])] }, finishedAt: { not: null } },
    });
  });
}

/** The newest successful run with teams, whose registrations are shown. */
async function shownCrawlId(db: Db): Promise<string | null> {
  const crawl = await db.oplCrawl.findFirst({
    where: { finishedAt: { not: null }, failed: false, registrations: { some: {} } },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  return crawl?.id ?? null;
}

export type UniligaLeagues = { byTeam: Map<number, League>; options: number[] };

/**
 * The leagues of the current season: per OPL team ID (for the given teams, or "all" registered ones,
 * a few hundred) and all leagues as filter options, in order. A run still going changes nothing
 * until it is done. One snapshot, so a run finishing meanwhile can't delete the rows being read.
 */
export async function getUniligaLeagues(
  oplTeamIds: readonly (number | null)[] | "all",
): Promise<UniligaLeagues> {
  return prisma.$transaction((tx) => readLeagues(tx, oplTeamIds), {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  });
}

async function readLeagues(
  db: Db,
  oplTeamIds: readonly (number | null)[] | "all",
): Promise<UniligaLeagues> {
  const crawlId = await shownCrawlId(db);
  if (!crawlId) return { byTeam: new Map(), options: [] };
  const ids =
    oplTeamIds === "all"
      ? null
      : [...new Set(oplTeamIds.filter((id): id is number => id !== null))];
  const [rows, divisions] = await Promise.all([
    ids === null || ids.length > 0
      ? db.uniligaRegistration.findMany({
          where: { crawlId, ...(ids ? { oplTeamId: { in: ids } } : {}) },
          select: { oplTeamId: true, division: true, group: true },
        })
      : [],
    db.uniligaRegistration.findMany({
      where: { crawlId },
      distinct: ["division"],
      orderBy: { division: "asc" },
      select: { division: true },
    }),
  ]);
  return {
    byTeam: new Map(
      rows.map((row) => [row.oplTeamId, { division: row.division, group: row.group }]),
    ),
    options: divisions.map((row) => row.division),
  };
}

/** The league of a linked team, or null. */
export function leagueOf(leagues: UniligaLeagues, oplTeamId: number | null): League | null {
  return oplTeamId === null ? null : (leagues.byTeam.get(oplTeamId) ?? null);
}
