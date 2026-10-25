import { RANK_LABELS } from "@uni-scrims/core";
import type { Rank } from "@uni-scrims/db";
import { cn } from "cn";

/**
 * Riot's icon of a rank (public/ranks, 64 px high), sized to the text around it (ARCHITECTURE
 * §5.19). Decorative: the rank's name always stands next to it.
 */
export function RankIcon({ rank, className }: { rank: Rank; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small static icon, already sized
    <img
      src={`/ranks/${rank.toLowerCase()}.png`}
      alt=""
      decoding="async"
      className={cn("inline-block size-[1.2em] object-contain align-[-0.25em]", className)}
    />
  );
}

/** Icon and name, kept on one line. */
export function RankLabel({ rank }: { rank: Rank }) {
  return (
    <span className="whitespace-nowrap">
      <RankIcon rank={rank} className="mr-[0.3em]" />
      {RANK_LABELS[rank]}
    </span>
  );
}

/** The computed team rank (SPEC N-16); a team without ranks is "Ohne Rang", without an icon. */
export function TeamRankLabel({ rank }: { rank: Rank | null }) {
  return rank ? <RankLabel rank={rank} /> : "Ohne Rang";
}

/** The rank range of a request, one rank when both ends are the same. */
export function RankRangeLabel({ rankMin, rankMax }: { rankMin: Rank; rankMax: Rank }) {
  return rankMin === rankMax ? (
    <RankLabel rank={rankMin} />
  ) : (
    <>
      <RankLabel rank={rankMin} /> – <RankLabel rank={rankMax} />
    </>
  );
}
