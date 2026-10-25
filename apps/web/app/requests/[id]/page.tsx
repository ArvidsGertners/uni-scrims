import {
  APPLICATION_MESSAGE_MAX,
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
import { CheckIcon } from "@/components/icons";
import { DETAIL_COLUMNS, PageMain } from "@/components/page-main";
import { RankLabel, RankRangeLabel } from "@/components/rank-icon";
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
  formatReliability,
  formatUniversities,
} from "@/lib/scrim-format";
import {
  applyAction,
  confirmApplicationAction,
  deleteRequestAction,
  withdrawApplicationAction,
} from "../actions";
import { getLocale, getText } from "@/lib/locale";
import { formatMessages } from "@/i18n/format";

const NEXT_STEPS = [
  "Das Team sieht eure Bewerbung und nimmt ein Team an.",
  "Bei einer Zusage bekommst du eine Discord-Nachricht.",
  "Die Lobby klärt ihr direkt auf Discord.",
];

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/requests/${id}`);
  const request = await getRequestDetail({ userId: user.id, requestId: id, now: new Date() });
  const text = await getText();
  const locale = await getLocale();
  if (!request) notFound();

  const { team } = request;
  const ownRequest = request.applications !== null;
  const status = request.open
    ? null
    : request.status === "OPEN"
      ? "Abgelaufen"
      : REQUEST_STATUS_LABELS[locale][request.status];
  const details = [
    { label: "Datum", value: formatWeekdayDate(request.startsAt, locale) },
    { label: "Uhrzeit", value: describeStartTime(request.startsAt, locale) },
    { label: "Format", value: formatFormat(request.format, locale) },
    { label: "Maps", value: formatMaps(request.maps, locale) },
    {
      label: "Rang",
      value: <RankRangeLabel rankMin={request.rankMin} rankMax={request.rankMax} />,
    },
    { label: "Teamrang", value: <RankLabel rank={team.rank} /> },
  ];
  const ownApplication = request.ownApplication;
  const hasActions = Boolean(request.apply || ownApplication || request.applications);

  return (
    <PageMain width="wide" className="gap-7">
      {/* The own requests are in the Anfragen tab, not on the board (SPEC N-9). */}
      {ownRequest ? (
        <BackLink href="/scrims?tab=anfragen">Zurück zu euren Anfragen</BackLink>
      ) : (
        <BackLink href="/scrims">Zurück zum Board</BackLink>
      )}
      {request.otherOwnTeam ? (
        <SwitchTeamHint team={request.otherOwnTeam} returnTo={`/requests/${request.id}`}>
          Diese Anfrage gehört zu deinem Team {request.otherOwnTeam.name}. Die Bewerbungen siehst du
          als {request.otherOwnTeam.name}.
        </SwitchTeamHint>
      ) : null}

      <div className="flex items-center gap-4">
        <TeamAvatar team={team} size="lg" own={ownRequest} />
        <div className="flex min-w-0 flex-col gap-1.5">
          {/* The team's external links next to its name (SPEC N-15). */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="min-w-0 type-h1 break-words">{team.name}</h1>
            <TeamLinks teamName={team.name} links={team.links} />
          </div>
          <span className="flex flex-wrap items-center gap-2 text-[14px] text-muted-foreground">
            {formatUniversities(team.universities, locale)}
            {status ? <Badge className="h-[22px] px-2 text-[12px]">{status}</Badge> : null}
          </span>
          <span className="text-[13px] text-muted-foreground">
            {formatReliability(team.reliability, locale)}
          </span>
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
              <span className="type-label text-muted-foreground">Notiz vom Team</span>
              <p className="text-[16px] text-pretty whitespace-pre-line">„{request.note}“</p>
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
              Zum gebuchten Scrim
            </Link>
          ) : null}
        </div>
        {hasActions ? (
          <div className="flex min-w-0 flex-col gap-7">
            {request.apply ? (
              <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
                <div className="flex flex-col gap-1">
                  <h2 className="type-h2">Bewerben</h2>
                  {request.applyAs ? (
                    <span className="text-[14px] text-muted-foreground">
                      Du bewirbst dich als{" "}
                      <span className="font-semibold text-foreground">{request.applyAs.name}</span>{" "}
                      · {request.applyAs.memberCount} Mitglieder
                    </span>
                  ) : null}
                </div>
                {request.outOfRange ? (
                  <p className="text-[14px] text-pretty text-warning">
                    Euer Team-Rang liegt außerhalb des gewünschten Bereichs. Ihr könnt euch trotzdem
                    bewerben, das Team entscheidet.
                  </p>
                ) : null}
                {request.apply.problem === null ? (
                  <ActionForm
                    action={applyAction}
                    submitLabel="Jetzt bewerben"
                    size="lg"
                    submitClassName="w-full"
                    className="flex flex-col gap-4"
                  >
                    <input type="hidden" name="requestId" value={request.id} />
                    {/* The team the page was shown for (§5.20). */}
                    <input type="hidden" name="teamId" value={request.actingTeamId ?? ""} />
                    <input type="hidden" name="teamName" value={team.name} />
                    <CountedTextarea
                      label={`Nachricht an ${team.name}`}
                      name="message"
                      maxLength={APPLICATION_MESSAGE_MAX}
                      rows={3}
                      placeholder="z. B. Wir sind Gold 3 bis Platinum 2 und können ab 18:30."
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
                        ? "Bewerbung gesendet"
                        : ownApplication.status === "ACCEPTED"
                          ? "Bewerbung angenommen"
                          : ownApplication.status === "REJECTED"
                            ? "Bewerbung abgelehnt"
                            : "Bewerbung zurückgezogen"}
                    </span>
                    <span className="text-[14px] text-pretty text-muted-foreground">
                      {ownApplication.status === "PENDING"
                        ? `${team.name} sieht jetzt eure Bewerbung. Bei einer Zusage bekommst du eine Discord-Nachricht.`
                        : ownApplication.status === "ACCEPTED"
                          ? "Der Scrim ist gebucht. Die Lobby klärt ihr direkt auf Discord."
                          : ownApplication.status === "REJECTED"
                            ? "Diese Bewerbung wurde nicht angenommen."
                            : "Auf diese Anfrage könnt ihr euch nicht erneut bewerben."}
                    </span>
                  </div>
                </div>
                {ownApplication.message ? (
                  <p className="text-[14px] whitespace-pre-line text-muted-foreground">
                    „{ownApplication.message}“
                  </p>
                ) : null}
                {request.withdraw?.problem === null ? (
                  <ActionForm
                    action={withdrawApplicationAction}
                    submitLabel="Bewerbung zurückziehen"
                    variant="outline"
                    size="sm"
                    confirmText="Bewerbung zurückziehen? Ihr könnt euch danach nicht erneut auf diese Anfrage bewerben."
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
                <span className="type-label text-muted-foreground">So geht&apos;s weiter</span>
                <ol className="flex flex-col gap-3.5">
                  {NEXT_STEPS.map((step, index) => (
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

            {request.applications ? (
              <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
                <h2 className="type-label text-muted-foreground">
                  Bewerbungen ({request.applications.length})
                </h2>
                {request.applications.length === 0 ? (
                  <p className="text-[14px] text-pretty text-muted-foreground">
                    Noch keine Bewerbungen. Du bekommst eine Discord-Nachricht, sobald sich ein Team
                    bewirbt.
                  </p>
                ) : null}
                {request.confirm?.problem ? (
                  <p className="text-[14px] text-pretty text-muted-foreground">
                    Annehmen geht gerade nicht: {text(request.confirm.problem)}
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
                        <div className="flex flex-wrap items-center gap-x-1.5">
                          <span className="font-semibold">{application.team.name}</span>
                          <TeamLinks
                            teamName={application.team.name}
                            links={application.team.links}
                            className="-my-1.5"
                          />
                        </div>
                        <span className="text-[13px] text-muted-foreground">
                          {formatUniversities(application.team.universities, locale)}
                        </span>
                      </div>
                      {application.status === "ACCEPTED" ? (
                        <span className="shrink-0 text-[13px] font-semibold text-success">
                          Angenommen
                        </span>
                      ) : application.status !== "PENDING" ? (
                        <span className="shrink-0 text-[13px] text-faint">
                          {formatMessages[locale].applicationStatus[application.status]}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[13px] text-muted-foreground">
                      Teamrang <RankLabel rank={application.team.rank} /> ·{" "}
                      {formatReliability(application.team.reliability, locale)}
                    </p>
                    {application.outOfRange ? (
                      <p className="text-[13px] text-warning">Teamrang außerhalb des Bereichs</p>
                    ) : null}
                    {application.message ? (
                      <p className="text-[14px] whitespace-pre-line text-muted-foreground">
                        „{application.message}“
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
                        submitLabel="Annehmen"
                        size="sm"
                        confirmText={`Scrim mit ${application.team.name} buchen? Alle anderen Bewerbungen werden abgelehnt.`}
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
                      submitLabel="Anfrage zurückziehen"
                      variant="link"
                      size="bare"
                      submitClassName="min-h-10"
                      confirmText="Anfrage zurückziehen? Offene Bewerbungen werden abgelehnt."
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
