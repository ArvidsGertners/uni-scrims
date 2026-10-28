// The daily recheck of OPL links (SPEC N-35, ARCHITECTURE §5.37, §6.5): one link per call, the most
// overdue first; the bot's OPL loop paces the calls. Writes only if the link is still the one checked.
// Since Phase 40 a due step of the Uniliga run (§5.38) goes before the links.
import { prisma } from "@uni-scrims/db";
import { lockTeam, lockUser } from "../locks.ts";
import { getDiscordId } from "../users.ts";
import { type OplApi, OplError, type OplRateLimit } from "./client.ts";
import {
  NO_USER_OPL,
  OPL_GONE_LIMIT,
  type Random,
  clearTeamOpl,
  nextOplCheck,
  writeRosterMatches,
} from "./links.ts";
import { uniligaTick } from "./uniliga.ts";

const MINUTE = 60 * 1000;
/** After "deleted" or a failed call the link is checked again after about this long. */
const RETRY_MS = 120 * MINUTE;
const RETRY_SPREAD_MS = 15 * MINUTE;

export type OplTickResult = { checked: boolean; rateLimit: OplRateLimit | null };

function retryAt(now: Date, random: Random): Date {
  return new Date(now.getTime() + RETRY_MS + (random() * 2 - 1) * RETRY_SPREAD_MS);
}

/**
 * Checks the most overdue link (users and teams together). Returns whether OPL was called. Throws an
 * OplError with reason "auth" (key rejected) without writing anything; the loop pauses then. On a
 * used-up limit (429) the link stays due and the result carries OPL's reset, so the loop waits.
 */
export async function oplTick(input: {
  now: Date;
  opl: OplApi;
  random?: Random;
}): Promise<OplTickResult> {
  const { now, opl } = input;
  const random = input.random ?? Math.random;
  // A due step of the Uniliga run goes first (§5.38), still one call per tick.
  const crawl = await uniligaTick({ now, opl });
  if (crawl) return crawl;
  const [user, team] = await Promise.all([
    prisma.user.findFirst({
      where: { oplUserId: { not: null }, oplNextCheckAt: { lte: now } },
      orderBy: [{ oplNextCheckAt: "asc" }, { id: "asc" }],
      select: { id: true, oplUserId: true, oplLinkedAt: true, oplNextCheckAt: true },
    }),
    prisma.team.findFirst({
      where: { oplTeamId: { not: null }, dissolvedAt: null, oplNextCheckAt: { lte: now } },
      orderBy: [{ oplNextCheckAt: "asc" }, { id: "asc" }],
      select: { id: true, oplTeamId: true, oplLinkedAt: true, oplNextCheckAt: true },
    }),
  ]);
  const userFirst = user && (!team || user.oplNextCheckAt! <= team.oplNextCheckAt!);
  if (userFirst) return checkUser(user, now, opl, random);
  if (team) return checkTeam(team, now, opl, random);
  return { checked: false, rateLimit: null };
}

async function checkUser(
  link: { id: string; oplUserId: number | null; oplLinkedAt: Date | null },
  now: Date,
  opl: OplApi,
  random: Random,
): Promise<OplTickResult> {
  const oplUserId = link.oplUserId!;
  const same = { id: link.id, oplUserId, oplLinkedAt: link.oplLinkedAt };
  let response;
  try {
    response = await opl.user(oplUserId);
  } catch (error) {
    if (!(error instanceof OplError) || error.reason === "auth") throw error;
    if (error.reason !== "rate") {
      await prisma.user.updateMany({ where: same, data: { oplNextCheckAt: retryAt(now, random) } });
    }
    return { checked: true, rateLimit: error.rateLimit };
  }
  const { result } = response;
  await prisma.$transaction(async (tx) => {
    await lockUser(tx, link.id);
    const current = await tx.user.findFirst({ where: same, select: { oplFailures: true } });
    // Unlinked or linked again meanwhile: not this check's business.
    if (!current) return;
    if (result.kind === "gone") {
      const failures = current.oplFailures + 1;
      await tx.user.update({
        where: { id: link.id },
        data:
          failures >= OPL_GONE_LIMIT
            ? NO_USER_OPL
            : { oplFailures: failures, oplNextCheckAt: retryAt(now, random) },
      });
      return;
    }
    // Another Discord account on OPL now: the link goes at once (SPEC N-35).
    const discordId = await getDiscordId(link.id, tx);
    if (!result.discordId || result.discordId !== discordId) {
      await tx.user.update({ where: { id: link.id }, data: NO_USER_OPL });
      return;
    }
    await tx.user.update({
      where: { id: link.id },
      data: { oplCheckedAt: now, oplFailures: 0, oplNextCheckAt: nextOplCheck(now, random) },
    });
  });
  return { checked: true, rateLimit: response.rateLimit };
}

async function checkTeam(
  link: { id: string; oplTeamId: number | null; oplLinkedAt: Date | null },
  now: Date,
  opl: OplApi,
  random: Random,
): Promise<OplTickResult> {
  const oplTeamId = link.oplTeamId!;
  const same = { id: link.id, oplTeamId, oplLinkedAt: link.oplLinkedAt, dissolvedAt: null };
  let response;
  try {
    response = await opl.teamRoster(oplTeamId);
  } catch (error) {
    if (!(error instanceof OplError) || error.reason === "auth") throw error;
    if (error.reason !== "rate") {
      await prisma.team.updateMany({ where: same, data: { oplNextCheckAt: retryAt(now, random) } });
    }
    return { checked: true, rateLimit: error.rateLimit };
  }
  const { result } = response;
  await prisma.$transaction(async (tx) => {
    await lockTeam(tx, link.id);
    const current = await tx.team.findFirst({ where: same, select: { oplFailures: true } });
    if (!current) return;
    if (result.kind === "gone") {
      const failures = current.oplFailures + 1;
      if (failures >= OPL_GONE_LIMIT) {
        await clearTeamOpl(tx, link.id);
        return;
      }
      await tx.team.update({
        where: { id: link.id },
        data: { oplFailures: failures, oplNextCheckAt: retryAt(now, random) },
      });
      return;
    }
    // The captain need not stand in the roster any more (SPEC N-35); only the matches change.
    const others = await writeRosterMatches(tx, link.id, result.members);
    await tx.team.update({
      where: { id: link.id },
      data: {
        oplCheckedAt: now,
        oplFailures: 0,
        oplNextCheckAt: nextOplCheck(now, random),
        oplRosterOthers: others,
      },
    });
  });
  return { checked: true, rateLimit: response.rateLimit };
}
