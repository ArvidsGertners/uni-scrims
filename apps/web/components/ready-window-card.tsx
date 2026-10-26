import { type Message, type TeamCardData, toBerlinTimeString } from "@uni-scrims/core";
import type { Rank, RequestStatus, ScrimFormat } from "@uni-scrims/db";
import Link from "next/link";
import { requestReadyWindowAction } from "@/app/requests/actions";
import { ActionForm } from "@/components/action-form";
import { FullyVerifiedBadge } from "@/components/fully-verified-badge";
import { ChevronRightIcon, ClockIcon, MapPinIcon } from "@/components/icons";
import { RankLabel, RankRangeLabel } from "@/components/rank-icon";
import { ReliabilityLine } from "@/components/reliability-line";
import { TeamAvatar } from "@/components/team-avatar";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { formatFormat, formatMaps, formatUniversities } from "@/lib/scrim-format";
import { getLocale, getMessages, getText } from "@/lib/locale";
import { loginUrl } from "@/lib/session";
import { newRequestMessages, readyWindowMessages, scrimSharedMessages } from "@/i18n/scrims";

export type CardReadyWindow = {
  id: string;
  /** The start times still to request, from the earliest; never empty. */
  startOptions: Date[];
  lastStartsAt: Date;
  format: ScrimFormat;
  rankMin: Rank;
  rankMax: Rank;
  maps: string[];
  team: TeamCardData;
  /** Missing on the public board, which has no own team (SPEC N-24). */
  ownRequest?: { id: string; status: RequestStatus; open: boolean } | null;
  request?: { problem: Message | null } | null;
};

/**
 * A window "Heute spielbereit" of another team on the board (SPEC N-27): the team like a request
 * card, then picking a start time and "Anfragen" for the acting team (`actingTeamId`, §5.20). Not a
 * link: there is no page for a window. On the public board (no `actingTeamId`) it leads to the login.
 */
export async function ReadyWindowCard({
  window,
  actingTeamId,
  signedIn,
}: {
  window: CardReadyWindow;
  actingTeamId: string | null;
  signedIn: boolean;
}) {
  const { team } = window;
  const locale = await getLocale();
  const text = await getText();
  const t = await getMessages(readyWindowMessages);
  const shared = await getMessages(scrimSharedMessages);
  const form = await getMessages(newRequestMessages);
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-[18px]">
      <div className="flex items-center gap-3">
        <TeamAvatar team={team} className="border-border" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 text-[16px] font-semibold break-words">{team.name}</span>
            {team.fullyVerified ? <FullyVerifiedBadge /> : null}
          </span>
          <span className="truncate text-[13px] text-muted-foreground">
            {formatUniversities(team.universities, locale)}
          </span>
        </div>
        <Badge variant="outline">{formatFormat(window.format, locale)}</Badge>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-x-[18px] gap-y-2 text-[14px] text-muted-foreground">
          <span className="flex items-center gap-1.5 text-foreground">
            <ClockIcon />
            {t.startBetween(
              toBerlinTimeString(window.startOptions[0]!),
              toBerlinTimeString(window.lastStartsAt),
            )}
          </span>
          <span>
            <RankRangeLabel rankMin={window.rankMin} rankMax={window.rankMax} />
          </span>
          <span className="flex items-center gap-1.5">
            <MapPinIcon />
            {formatMaps(window.maps, locale)}
          </span>
        </div>
        <p className="text-[13px] text-muted-foreground">
          {shared.teamRank} <RankLabel rank={team.rank} />
        </p>
        <ReliabilityLine reliability={team.reliability} />
      </div>
      <div className="border-t border-border pt-3.5">
        {!signedIn ? (
          <Link
            href={loginUrl("/scrims")}
            className="flex items-center gap-0.5 text-[14px] font-semibold text-accent-text"
          >
            {t.signInToRequest}
            <ChevronRightIcon strokeWidth={2.5} />
          </Link>
        ) : window.ownRequest ? (
          <Link
            href={`/requests/${window.ownRequest.id}`}
            className="flex items-center justify-between gap-2.5"
          >
            <Badge variant={window.ownRequest.open ? "accent" : "neutral"}>
              {window.ownRequest.open ? t.ownRequest.OPEN : t.ownRequest[window.ownRequest.status]}
            </Badge>
            <span className="flex items-center gap-0.5 text-[14px] font-semibold text-accent-text">
              {shared.view}
              <ChevronRightIcon strokeWidth={2.5} />
            </span>
          </Link>
        ) : !window.request || !actingTeamId ? (
          <p className="text-[13px] text-muted-foreground">{t.noTeam}</p>
        ) : window.request.problem ? (
          <p className="text-[13px] text-pretty text-muted-foreground">
            {text(window.request.problem)}
          </p>
        ) : (
          <ActionForm
            action={requestReadyWindowAction}
            submitLabel={t.request}
            confirmText={t.confirmRequest(team.name)}
            className="flex flex-wrap items-start gap-2.5"
          >
            <input type="hidden" name="windowId" value={window.id} />
            <input type="hidden" name="teamId" value={actingTeamId} />
            {/* Only for the toast text. */}
            <input type="hidden" name="teamName" value={team.name} />
            <div className="min-w-[8.5rem] flex-1">
              <Select
                name="startsAt"
                aria-label={t.startTime}
                required
                defaultValue={window.startOptions[0]!.toISOString()}
                options={window.startOptions.map((start) => ({
                  value: start.toISOString(),
                  label: form.timeOption(toBerlinTimeString(start)),
                }))}
              />
            </div>
          </ActionForm>
        )}
      </div>
    </div>
  );
}
