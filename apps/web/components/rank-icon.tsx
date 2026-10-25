import { RANK_LABELS } from "@uni-scrims/core";
import type { Rank } from "@uni-scrims/db";
import { cn } from "cn";
import type { StaticImageData } from "next/image";
import { rankMessages } from "@/i18n/chrome";
import { getMessages } from "@/lib/locale";
import ascendant from "@/assets/ranks/ascendant.png";
import bronze from "@/assets/ranks/bronze.png";
import diamond from "@/assets/ranks/diamond.png";
import gold from "@/assets/ranks/gold.png";
import immortal from "@/assets/ranks/immortal.png";
import iron from "@/assets/ranks/iron.png";
import platinum from "@/assets/ranks/platinum.png";
import radiant from "@/assets/ranks/radiant.png";
import silver from "@/assets/ranks/silver.png";
import unrated from "@/assets/ranks/unrated.png";

// Imported, so the build serves them under a hashed /_next/static/media URL, cached for a year.
const RANK_ICONS: Record<Rank, StaticImageData> = {
  IRON: iron,
  BRONZE: bronze,
  SILVER: silver,
  GOLD: gold,
  PLATINUM: platinum,
  DIAMOND: diamond,
  ASCENDANT: ascendant,
  IMMORTAL: immortal,
  RADIANT: radiant,
};

/**
 * Riot's icon of a rank, sized to the text around it (ARCHITECTURE §5.19); without a rank Riot's
 * "Unrated" icon. Decorative: the rank's name always stands next to it.
 */
export function RankIcon({ rank, className }: { rank: Rank | null; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small static icon, already sized
    <img
      src={(rank ? RANK_ICONS[rank] : unrated).src}
      alt=""
      decoding="async"
      className={cn("inline-block size-[1.2em] object-contain align-[-0.25em]", className)}
    />
  );
}

/** Icon and name, kept on one line; without a rank "Unranked" (rank names are the same in English). */
export async function RankLabel({ rank }: { rank: Rank | null }) {
  const t = await getMessages(rankMessages);
  return (
    <span className="whitespace-nowrap">
      <RankIcon rank={rank} className="mr-[0.3em]" />
      {rank ? RANK_LABELS[rank] : t.unranked}
    </span>
  );
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
