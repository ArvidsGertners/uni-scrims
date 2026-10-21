import type { TeamCardData } from "@uni-scrims/core";
import { describeStart } from "@uni-scrims/core";
import type { AppStatus, Rank, ScrimFormat } from "@uni-scrims/db";
import Link from "next/link";
import { TeamSummary } from "@/components/team-summary";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  APPLICATION_STATUS_LABELS,
  formatFormat,
  formatMaps,
  formatRankRange,
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

export function RequestCard({ request }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Link href={`/requests/${request.id}`} className="underline-offset-4 hover:underline">
            {describeStart(request.startsAt)}
          </Link>
          {request.ownApplicationStatus ? (
            <Badge variant="secondary">
              Beworben: {APPLICATION_STATUS_LABELS[request.ownApplicationStatus]}
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p>
          {formatFormat(request.format)} · Rang {formatRankRange(request.rankMin, request.rankMax)}{" "}
          · Maps: {formatMaps(request.maps)}
        </p>
        <TeamSummary team={request.team} />
        <p className="opacity-70">
          {request.applicationCount === 1
            ? "1 Bewerbung"
            : `${request.applicationCount} Bewerbungen`}
        </p>
      </CardContent>
    </Card>
  );
}
