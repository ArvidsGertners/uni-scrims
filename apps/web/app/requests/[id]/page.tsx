import {
  APPLICATION_MESSAGE_MAX,
  describeStartDay,
  describeStartTime,
  formatWeekdayDate,
  getRequestDetail,
} from "@uni-scrims/core";
import { cn } from "cn";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { CountedTextarea } from "@/components/counted-textarea";
import { FullyVerifiedBadge } from "@/components/fully-verified-badge";
import { CheckIcon, ShieldCheckIcon } from "@/components/icons";
import { DETAIL_COLUMNS, PageMain } from "@/components/page-main";
import { RankLabel, RankRangeLabel } from "@/components/rank-icon";
import { ReliabilityLine } from "@/components/reliability-line";
import { TeamAvatar } from "@/components/team-avatar";
import { SwitchTeamHint } from "@/components/switch-team-hint";
import { TeamLinks } from "@/components/team-links";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requirePageUser } from "@/lib/session";
import {
  REQUEST_STATUS_LABELS,
  formatFormat,
  formatMaps,
  formatUniversities,
} from "@/lib/scrim-format";
import {
  acceptDirectRequestAction,
  applyAction,
  confirmApplicationAction,
  declineDirectRequestAction,
  deleteRequestAction,
  withdrawApplicationAction,
} from "../actions";
import { getLocale, getMessages, getText } from "@/lib/locale";
import { formatMessages, fullyVerifiedMessages } from "@/i18n/format";
import { readyWindowMessages, requestDetailMessages, scrimSharedMessages } from "@/i18n/scrims";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/requests/${id}`);
  const request = await getRequestDetail({ userId: user.id, requestId: id, now: new Date() });
  const text = await getText();
  const locale = await getLocale();
  const t = await getMessages(requestDetailMessages);
  const ready = await getMessages(readyWindowMessages);
  const shared = await getMessages(scrimSharedMessages);
  const verified = await getMessages(fullyVerifiedMessages);
  if (!request) notFound();

  const { direct } = request;
  // A direct request shows the other team in the head (SPEC N-26): the requesting team to the
  // requested one, the requested team to everyone else.
  const team = direct && !direct.incoming ? direct.target : request.team;
  const ownRequest = request.applications !== null;
  const status = request.open
    ? null
    : request.status === "OPEN"
      ? t.expired
      : REQUEST_STATUS_LABELS[locale][request.status];
  const details = [
    { label: shared.date, value: formatWeekdayDate(request.startsAt, locale) },
    { label: shared.time, value: describeStartTime(request.startsAt, locale) },
    { label: shared.format, value: formatFormat(request.format, locale) },
    { label: shared.maps, value: formatMaps(request.maps, locale) },
    // A direct request has no rank range (SPEC N-26).
    ...(direct
      ? []
      : [
          {
            label: t.rank,
            value: <RankRangeLabel rankMin={request.rankMin} rankMax={request.rankMax} />,
          },
        ]),
    { label: shared.teamRank, value: <RankLabel rank={team.rank} /> },
  ];
  const ownApplication = request.ownApplication;
  // A direct request only has something to do while it is open (SPEC N-26); afterwards the head
  // shows its status, and a booked one links to the scrim.
  const directOpen = direct !== null && request.open;
  const hasActions = Boolean(
    request.apply || ownApplication || (request.applications && !direct) || directOpen,
  );

  return (
    <PageMain width="wide" className="gap-7">
      {/* The own requests are in the Anfragen tab, not on the board (SPEC N-9). */}
      {ownRequest || direct ? (
        <BackLink href="/scrims?tab=anfragen">{t.backToOwnRequests}</BackLink>
      ) : (
        <BackLink href="/scrims">{shared.backToBoard}</BackLink>
      )}
      {request.otherOwnTeam ? (
        <SwitchTeamHint team={request.otherOwnTeam} returnTo={`/requests/${request.id}`}>
          {direct?.target.id === request.otherOwnTeam.id
            ? t.otherOwnTeamDirect(request.otherOwnTeam.name)
            : t.otherOwnTeam(request.otherOwnTeam.name)}
        </SwitchTeamHint>
      ) : null}

      <div className="flex items-center gap-4">
        <TeamAvatar team={team} size="lg" own={ownRequest && !direct} />
        <div className="flex min-w-0 flex-col gap-1.5">
          {direct ? (
            <span className="type-label text-muted-foreground">
              {direct.incoming ? t.directFrom : t.directTo}
            </span>
          ) : null}
          {/* The team's external links next to its name (SPEC N-15). */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="min-w-0 type-h1 break-words">{team.name}</h1>
            <TeamLinks teamName={team.name} links={team.links} />
          </div>
          <span className="flex flex-wrap items-center gap-2 text-[14px] text-muted-foreground">
            {formatUniversities(team.universities, locale)}
            {team.fullyVerified ? <FullyVerifiedBadge /> : null}
            {status ? <Badge className="h-[22px] px-2 text-[12px]">{status}</Badge> : null}
            {/* Only the own team learns that a request comes from a weekly series (SPEC N-25). */}
            {request.weekly ? (
              <Badge className="h-[22px] px-2 text-[12px]">{t.weekly}</Badge>
            ) : null}
            {/* For a start time in a window "Heute spielbereit" (SPEC N-27). */}
            {direct?.readyWindow ? (
              <Badge className="h-[22px] px-2 text-[12px]">{ready.badge}</Badge>
            ) : null}
          </span>
          <ReliabilityLine reliability={team.reliability} />
          {/* The current setting; only meaningful while the request takes applications. */}
          {request.open && request.verifiedApplicantsOnly && !direct ? (
            <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <ShieldCheckIcon size={14} />
              {verified.applicantsOnly}
            </span>
          ) : null}
        </div>
      </div>

      {/* From 1024 px the details left, applying and the applications right (SPEC N-12); below in
          this order. */}
      <div
        className={cn(
          "flex flex-col gap-7",
          hasActions && DETAIL_COLUMNS,
          hasActions && "lg:gap-8",
        )}
      >
        <div className="flex min-w-0 flex-col gap-7">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
            {details.map((detail) => (
              <div key={detail.label} className="flex min-w-0 flex-col gap-1 bg-card p-4">
                <dt className="type-label text-muted-foreground">{detail.label}</dt>
                {/* A rank may break after its icon here: "Ascendant" with icon is wider than a
                    tile at 320 px, and the grid clips. */}
                <dd className="type-btn text-[18px] leading-[1.25] font-semibold *:whitespace-normal">
                  {detail.value}
                </dd>
              </div>
            ))}
          </dl>

          {request.note ? (
            <div className="flex flex-col gap-2">
              <span className="type-label text-muted-foreground">{t.teamNote}</span>
              <p className="text-[16px] text-pretty whitespace-pre-line">
                {shared.quoted(request.note)}
              </p>
            </div>
          ) : null}

          {request.scrimId ? (
            <Link
              href={`/scrims/${request.scrimId}`}
              className={buttonVariants({
                variant: "outline",
                size: "sm",
                className: "self-start",
              })}
            >
              {t.toBookedScrim}
            </Link>
          ) : null}
        </div>
        {hasActions ? (
          <div className="flex min-w-0 flex-col gap-7">
            {request.apply ? (
              <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
                <div className="flex flex-col gap-1">
                  <h2 className="type-h2">{t.apply}</h2>
                  {request.applyAs ? (
                    <span className="text-[14px] text-muted-foreground">
                      {t.applyingAs(
                        <span className="font-semibold text-foreground">
                          {request.applyAs.name}
                        </span>,
                        request.applyAs.memberCount,
                      )}
                    </span>
                  ) : null}
                </div>
                {request.outOfRange ? (
                  <p className="text-[14px] text-pretty text-warning">{t.outOfRange}</p>
                ) : null}
                {request.apply.problem === null ? (
                  <ActionForm
                    action={applyAction}
                    submitLabel={t.applyNow}
                    size="lg"
                    submitClassName="w-full"
                    className="flex flex-col gap-4"
                  >
                    <input type="hidden" name="requestId" value={request.id} />
                    {/* The team the page was shown for (§5.20). */}
                    <input type="hidden" name="teamId" value={request.actingTeamId ?? ""} />
                    <input type="hidden" name="teamName" value={team.name} />
                    <CountedTextarea
                      label={t.messageTo(team.name)}
                      name="message"
                      maxLength={APPLICATION_MESSAGE_MAX}
                      rows={3}
                      placeholder={t.messagePlaceholder}
                    />
                  </ActionForm>
                ) : (
                  <p className="text-[14px] text-pretty text-muted-foreground">
                    {text(request.apply.problem)}
                  </p>
                )}
              </section>
            ) : null}

            {ownApplication ? (
              <section
                className={
                  ownApplication.status === "PENDING" || ownApplication.status === "ACCEPTED"
                    ? "flex flex-col gap-3.5 rounded-lg border border-success-line bg-success-soft p-[18px]"
                    : "flex flex-col gap-3.5 rounded-lg border border-border bg-card p-[18px]"
                }
              >
                <div className="flex items-start gap-3">
                  {ownApplication.status === "PENDING" || ownApplication.status === "ACCEPTED" ? (
                    <CheckIcon size={22} strokeWidth={2.5} className="text-success" />
                  ) : null}
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold">
                      {ownApplication.status === "PENDING"
                        ? t.applicationSent
                        : ownApplication.status === "ACCEPTED"
                          ? t.applicationAccepted
                          : ownApplication.status === "REJECTED"
                            ? t.applicationRejected
                            : t.applicationWithdrawn}
                    </span>
                    <span className="text-[14px] text-pretty text-muted-foreground">
                      {ownApplication.status === "PENDING"
                        ? t.sentText(team.name)
                        : ownApplication.status === "ACCEPTED"
                          ? t.acceptedText
                          : ownApplication.status === "REJECTED"
                            ? t.rejectedText
                            : t.withdrawnText}
                    </span>
                  </div>
                </div>
                {ownApplication.message ? (
                  <p className="text-[14px] whitespace-pre-line text-muted-foreground">
                    {shared.quoted(ownApplication.message)}
                  </p>
                ) : null}
                {request.withdraw?.problem === null ? (
                  <ActionForm
                    action={withdrawApplicationAction}
                    submitLabel={t.withdrawApplication}
                    variant="outline"
                    size="sm"
                    confirmText={t.confirmWithdrawApplication}
                    confirmDestructive
                  >
                    <input type="hidden" name="requestId" value={request.id} />
                    <input type="hidden" name="applicationId" value={ownApplication.id} />
                  </ActionForm>
                ) : request.withdraw ? (
                  <p className="text-[14px] text-muted-foreground">
                    {text(request.withdraw.problem)}
                  </p>
                ) : null}
              </section>
            ) : null}

            {request.apply || ownApplication?.status === "PENDING" ? (
              <div className="flex flex-col gap-3.5">
                <span className="type-label text-muted-foreground">{t.nextStepsTitle}</span>
                <ol className="flex flex-col gap-3.5">
                  {t.nextSteps.map((step, index) => (
                    <li key={step} className="flex items-baseline gap-3.5">
                      <span className="shrink-0 font-label text-[13px] font-bold text-accent-text">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="text-[15px] text-pretty text-muted-foreground">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {direct && directOpen ? (
              <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
                <h2 className="type-label text-muted-foreground">
                  {direct.incoming ? t.yourAnswer : t.directStatus}
                </h2>
                {direct.weeklyUntil ? (
                  <p className="text-[14px] text-pretty">
                    {t.weeklyProposal(describeStartDay(direct.weeklyUntil, locale))}
                  </p>
                ) : null}
                {direct.incoming ? null : (
                  <p className="text-[14px] text-pretty text-muted-foreground">
                    {t.awaitingAnswer(direct.target.name)}
                  </p>
                )}
                {request.accept?.problem === null ? (
                  <div className="flex flex-wrap gap-2.5">
                    <ActionForm
                      action={acceptDirectRequestAction}
                      submitLabel={t.accept}
                      size="sm"
                      confirmText={
                        direct.weeklyUntil
                          ? t.confirmAcceptPartnership(
                              request.team.name,
                              describeStartDay(direct.weeklyUntil, locale),
                            )
                          : t.confirmAcceptDirect(request.team.name)
                      }
                    >
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="teamName" value={request.team.name} />
                      {direct.weeklyUntil ? <input type="hidden" name="weekly" value="1" /> : null}
                    </ActionForm>
                    <ActionForm
                      action={declineDirectRequestAction}
                      submitLabel={t.decline}
                      variant="outline"
                      size="sm"
                      confirmText={t.confirmDecline(request.team.name)}
                      confirmDestructive
                    >
                      <input type="hidden" name="requestId" value={request.id} />
                    </ActionForm>
                  </div>
                ) : request.accept ? (
                  <p className="text-[14px] text-pretty text-muted-foreground">
                    {t.cannotAnswer(text(request.accept.problem))}
                  </p>
                ) : direct.incoming ? (
                  <p className="text-[14px] text-pretty text-muted-foreground">
                    {t.captainAnswers}
                  </p>
                ) : null}
                {request.remove ? (
                  request.remove.problem === null ? (
                    <ActionForm
                      action={deleteRequestAction}
                      submitLabel={t.withdrawRequest}
                      variant="link"
                      size="bare"
                      submitClassName="min-h-10 self-start"
                      confirmText={t.confirmWithdrawDirect(direct.target.name)}
                      confirmDestructive
                    >
                      <input type="hidden" name="requestId" value={request.id} />
                    </ActionForm>
                  ) : (
                    <p className="text-[14px] text-muted-foreground">
                      {text(request.remove.problem)}
                    </p>
                  )
                ) : null}
              </section>
            ) : null}

            {request.applications && !direct ? (
              <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
                <h2 className="type-label text-muted-foreground">
                  {shared.applicationsWithCount(request.applications.length)}
                </h2>
                {request.applications.length === 0 ? (
                  <p className="text-[14px] text-pretty text-muted-foreground">
                    {t.noApplications}
                  </p>
                ) : null}
                {request.confirm?.problem ? (
                  <p className="text-[14px] text-pretty text-muted-foreground">
                    {t.cannotAccept(text(request.confirm.problem))}
                  </p>
                ) : null}
                {request.applications.map((application) => (
                  <div
                    key={application.id}
                    className="flex flex-col gap-3 rounded-sm bg-secondary p-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <TeamAvatar team={application.team} size="sm" className="bg-background" />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          <span className="font-semibold">{application.team.name}</span>
                          <TeamLinks
                            teamName={application.team.name}
                            links={application.team.links}
                            className="-my-1.5"
                          />
                          {application.team.fullyVerified ? <FullyVerifiedBadge /> : null}
                        </div>
                        <span className="text-[13px] text-muted-foreground">
                          {formatUniversities(application.team.universities, locale)}
                        </span>
                      </div>
                      {application.status === "ACCEPTED" ? (
                        <span className="shrink-0 text-[13px] font-semibold text-success">
                          {t.accepted}
                        </span>
                      ) : application.status !== "PENDING" ? (
                        <span className="shrink-0 text-[13px] text-faint">
                          {formatMessages[locale].applicationStatus[application.status]}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <p className="text-[13px] text-muted-foreground">
                        {shared.teamRank} <RankLabel rank={application.team.rank} />
                      </p>
                      <ReliabilityLine reliability={application.team.reliability} />
                    </div>
                    {application.outOfRange ? (
                      <p className="text-[13px] text-warning">{t.rankOutOfRange}</p>
                    ) : null}
                    {application.message ? (
                      <p className="text-[14px] whitespace-pre-line text-muted-foreground">
                        {shared.quoted(application.message)}
                      </p>
                    ) : null}
                    {application.teamProblem ? (
                      <p className="text-[14px] text-muted-foreground">
                        {text(application.teamProblem)}
                      </p>
                    ) : null}
                    {application.canConfirm ? (
                      <ActionForm
                        action={confirmApplicationAction}
                        submitLabel={t.accept}
                        size="sm"
                        confirmText={t.confirmAccept(application.team.name)}
                      >
                        <input type="hidden" name="requestId" value={request.id} />
                        <input type="hidden" name="applicationId" value={application.id} />
                        <input type="hidden" name="teamName" value={application.team.name} />
                      </ActionForm>
                    ) : null}
                  </div>
                ))}
                {request.remove ? (
                  request.remove.problem === null ? (
                    <ActionForm
                      action={deleteRequestAction}
                      submitLabel={t.withdrawRequest}
                      variant="link"
                      size="bare"
                      submitClassName="min-h-10"
                      confirmText={
                        request.weekly ? t.confirmWithdrawWeeklyRequest : t.confirmWithdrawRequest
                      }
                      confirmDestructive
                    >
                      <input type="hidden" name="requestId" value={request.id} />
                    </ActionForm>
                  ) : (
                    <p className="text-[14px] text-muted-foreground">
                      {text(request.remove.problem)}
                    </p>
                  )
                ) : null}
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </PageMain>
  );
}
