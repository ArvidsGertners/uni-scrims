import type { TeamCardData } from "@uni-scrims/core";
import { describeStartTime } from "@uni-scrims/core";
import type { AppStatus, Rank, ScrimFormat } from "@uni-scrims/db";
import Link from "next/link";
import { FullyVerifiedBadge } from "@/components/fully-verified-badge";
import { LeagueBadge } from "@/components/league-badge";
import {
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  MapPinIcon,
  ShieldCheckIcon,
} from "@/components/icons";
import { RankLabel, RankRangeLabel } from "@/components/rank-icon";
import { ReliabilityLine } from "@/components/reliability-line";
import { TeamAvatar } from "@/components/team-avatar";
import { Badge } from "@/components/ui/badge";
import { formatFormat, formatMaps, formatUniversities } from "@/lib/scrim-format";
import { getLocale, getMessages } from "@/lib/locale";
import { formatMessages, fullyVerifiedMessages } from "@/i18n/format";
import { requestCardMessages, scrimSharedMessages } from "@/i18n/scrims";

export type CardRequest = {
  startsAt: Date;
  format: ScrimFormat;
  rankMin: Rank;
  rankMax: Rank;
  maps: string[];
  applicationCount: number;
  team: TeamCardData;
  /** The team admits only fully verified applicants (SPEC N-21). */
  verifiedApplicantsOnly: boolean;
  /** Missing on the public board, which has no own team (SPEC N-24). */
  ownApplicationStatus?: AppStatus | null;
};

type Props =
  | { request: CardRequest & { id: string }; preview?: false }
  /** Static sample on the landing page: no link, no hover. */
  | { request: CardRequest; preview: true };

const cardClass = "flex flex-col gap-4 rounded-lg border border-border bg-card p-[18px]";

/** Board card (design handoff, card A); the whole card links to the request. */
export async function RequestCard({ request, preview }: Props) {
  const { team } = request;
  const locale = await getLocale();
  const t = await getMessages(requestCardMessages);
  const shared = await getMessages(scrimSharedMessages);
  const verified = await getMessages(fullyVerifiedMessages);
  const content = (
    <>
      <div className="flex items-center gap-3">
        <TeamAvatar team={team} className="border-border" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 text-[16px] font-semibold break-words">{team.name}</span>
            {team.fullyVerified ? <FullyVerifiedBadge /> : null}
            <LeagueBadge league={team.league} />
          </span>
          <span className="truncate text-[13px] text-muted-foreground">
            {formatUniversities(team.universities, locale)}
          </span>
        </div>
        <Badge variant="outline">{formatFormat(request.format, locale)}</Badge>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-x-[18px] gap-y-2 text-[14px] text-muted-foreground">
          <span className="flex items-center gap-1.5 text-foreground">
            <ClockIcon />
            {describeStartTime(request.startsAt, locale)}
          </span>
          {/* The rank icons take the place of a generic icon here. */}
          <span>
            <RankRangeLabel rankMin={request.rankMin} rankMax={request.rankMax} />
          </span>
          <span className="flex items-center gap-1.5">
            <MapPinIcon />
            {formatMaps(request.maps, locale)}
          </span>
        </div>
        <p className="text-[13px] text-muted-foreground">
          {shared.teamRank} <RankLabel rank={team.rank} />
        </p>
        <ReliabilityLine reliability={team.reliability} />
        {request.verifiedApplicantsOnly ? (
          <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <ShieldCheckIcon size={14} />
            {verified.applicantsOnly}
          </p>
        ) : null}
      </div>
      <div className="flex items-center justify-between border-t border-border pt-3.5">
        {/* The count stays next to the own application's status (SPEC P0-4). */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {request.ownApplicationStatus === "PENDING" ? (
            <Badge variant="accent">
              <CheckIcon size={14} strokeWidth={3} />
              {t.applied}
            </Badge>
          ) : request.ownApplicationStatus ? (
            <Badge>{formatMessages[locale].applicationStatus[request.ownApplicationStatus]}</Badge>
          ) : null}
          <span className="text-[13px] text-muted-foreground">
            {t.applicationCount(request.applicationCount)}
          </span>
        </div>
        <span className="flex items-center gap-0.5 text-[14px] font-semibold text-accent-text">
          {shared.view}
          <ChevronRightIcon strokeWidth={2.5} />
        </span>
      </div>
    </>
  );
  return preview ? (
    <div className={cardClass}>{content}</div>
  ) : (
    <Link
      href={`/requests/${request.id}`}
      className={`${cardClass} hover:border-border-strong hover:bg-secondary`}
    >
      {content}
    </Link>
  );
}
