import type { TeamCardData } from "@uni-scrims/core";
import { describeStartTime } from "@uni-scrims/core";
import type { AppStatus, Rank, ScrimFormat } from "@uni-scrims/db";
import Link from "next/link";
import { CheckIcon, ChevronRightIcon, ClockIcon, MapPinIcon } from "@/components/icons";
import { RankRangeLabel, TeamRankLabel } from "@/components/rank-icon";
import { TeamAvatar } from "@/components/team-avatar";
import { Badge } from "@/components/ui/badge";
import {
  APPLICATION_STATUS_LABELS,
  formatFormat,
  formatMaps,
  formatReliability,
  formatUniversities,
} from "@/lib/scrim-format";

type Props = {
  request: {
    id: string;
    startsAt: Date;
    format: ScrimFormat;
    rankMin: Rank;
    rankMax: Rank;
    maps: string[];
    applicationCount: number;
    team: TeamCardData;
    ownApplicationStatus: AppStatus | null;
  };
};

function applicationCountLabel(count: number): string {
  if (count === 0) return "Noch keine Bewerbungen";
  return count === 1 ? "1 Bewerbung" : `${count} Bewerbungen`;
}

/** Board card (design handoff, card A); the whole card links to the request. */
export function RequestCard({ request }: Props) {
  const { team } = request;
  return (
    <Link
      href={`/requests/${request.id}`}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-[18px] hover:border-border-strong hover:bg-secondary"
    >
      <div className="flex items-center gap-3">
        <TeamAvatar team={team} className="border-border" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[16px] font-semibold">{team.name}</span>
          <span className="truncate text-[13px] text-muted-foreground">
            {formatUniversities(team.universities)}
          </span>
        </div>
        <Badge variant="outline">{formatFormat(request.format)}</Badge>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-x-[18px] gap-y-2 text-[14px] text-muted-foreground">
          <span className="flex items-center gap-1.5 text-foreground">
            <ClockIcon />
            {describeStartTime(request.startsAt)}
          </span>
          {/* The rank icons take the place of a generic icon here. */}
          <span>
            <RankRangeLabel rankMin={request.rankMin} rankMax={request.rankMax} />
          </span>
          <span className="flex items-center gap-1.5">
            <MapPinIcon />
            {formatMaps(request.maps)}
          </span>
        </div>
        <p className="text-[13px] text-muted-foreground">
          Teamrang <TeamRankLabel rank={team.rank} /> · {formatReliability(team.reliability)}
        </p>
      </div>
      <div className="flex items-center justify-between border-t border-border pt-3.5">
        {/* The count stays next to the own application's status (SPEC P0-4). */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {request.ownApplicationStatus === "PENDING" ? (
            <Badge variant="accent">
              <CheckIcon size={14} strokeWidth={3} />
              Beworben
            </Badge>
          ) : request.ownApplicationStatus ? (
            <Badge>{APPLICATION_STATUS_LABELS[request.ownApplicationStatus]}</Badge>
          ) : null}
          <span className="text-[13px] text-muted-foreground">
            {applicationCountLabel(request.applicationCount)}
          </span>
        </div>
        <span className="flex items-center gap-0.5 text-[14px] font-semibold text-accent-text">
          Ansehen
          <ChevronRightIcon strokeWidth={2.5} />
        </span>
      </div>
    </Link>
  );
}
