import { Rank } from "@uni-scrims/db";

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
