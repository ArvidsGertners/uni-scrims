import { type MemberRole, Rank, prisma } from "@uni-scrims/db";
import type { Db } from "./db.ts";
import { isPlayingRole } from "./readiness.ts";

/** Valorant ranks in order (value 1–9, ARCHITECTURE §4). */
export const RANKS: readonly Rank[] = [
  Rank.IRON,
  Rank.BRONZE,
  Rank.SILVER,
  Rank.GOLD,
  Rank.PLATINUM,
  Rank.DIAMOND,
  Rank.ASCENDANT,
  Rank.IMMORTAL,
  Rank.RADIANT,
];

/** English rank names: players use them, also in German (unlike the design handoff). */
export const RANK_LABELS: Record<Rank, string> = {
  IRON: "Iron",
  BRONZE: "Bronze",
  SILVER: "Silver",
  GOLD: "Gold",
  PLATINUM: "Platinum",
  DIAMOND: "Diamond",
  ASCENDANT: "Ascendant",
  IMMORTAL: "Immortal",
  RADIANT: "Radiant",
};

/** Position in RANKS (1–9) for range comparisons. */
export function rankValue(rank: Rank): number {
  return RANKS.indexOf(rank) + 1;
}

/** rankMin ≤ rank ≤ rankMax. */
export function isRankInRange(rank: Rank, rankMin: Rank, rankMax: Rank): boolean {
  const value = rankValue(rank);
  return rankValue(rankMin) <= value && value <= rankValue(rankMax);
}

/**
 * A team rank outside a request's range: allowed, with a hint (SPEC P0-5). A team without a rank
 * is never outside (SPEC N-16).
 */
export function isOutsideRange(
  rank: Rank | null,
  range: { rankMin: Rank; rankMax: Rank },
): boolean {
  return rank !== null && !isRankInRange(rank, range.rankMin, range.rankMax);
}

// ─── Team rank (Phase 20, §5.19) ──────────────────────────────────────────────

/** What the team rank needs of each member; part of the reads that show it. */
export const teamRankMemberSelect = {
  role: true,
  user: { select: { rank: true } },
} as const;

type RankedMember = { role: MemberRole; user: { rank: Rank | null } };

/**
 * The team rank, computed when read: the average of the players' and substitutes' own ranks
 * (verified or not; coaches never), rounded half up; null if none of them has a rank.
 */
export function teamRankSummary(members: readonly RankedMember[]): {
  rank: Rank | null;
  rankedCount: number;
} {
  const values = members
    .filter((member) => isPlayingRole(member.role) && member.user.rank !== null)
    .map((member) => rankValue(member.user.rank!));
  if (values.length === 0) return { rank: null, rankedCount: 0 };
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { rank: RANKS[Math.floor(average + 0.5) - 1]!, rankedCount: values.length };
}

export function teamRank(members: readonly RankedMember[]): Rank | null {
  return teamRankSummary(members).rank;
}

/** teamRank for a team that is not loaded with its members (the own team from findOwnTeam). */
export async function loadTeamRank(teamId: string, db: Db = prisma): Promise<Rank | null> {
  return teamRank(
    await db.teamMember.findMany({ where: { teamId }, select: teamRankMemberSelect }),
  );
}
