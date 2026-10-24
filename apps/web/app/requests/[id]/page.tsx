import {
  APPLICATION_MESSAGE_MAX,
  RANK_LABELS,
  describeStartTime,
  formatWeekdayDate,
  getRequestDetail,
} from "@uni-scrims/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { CountedTextarea } from "@/components/counted-textarea";
import { CheckIcon } from "@/components/icons";
import { PageMain } from "@/components/page-main";
import { TeamAvatar } from "@/components/team-avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requirePageUser } from "@/lib/session";
import {
  APPLICATION_STATUS_LABELS,
  REQUEST_STATUS_LABELS,
  formatFormat,
  formatMaps,
  formatRankRange,
  formatReliability,
  formatUniversities,
} from "@/lib/scrim-format";
import {
  applyAction,
  confirmApplicationAction,
  deleteRequestAction,
  withdrawApplicationAction,
} from "../actions";

const NEXT_STEPS = [
  "Das Team sieht eure Bewerbung und nimmt ein Team an.",
  "Bei einer Zusage bekommst du eine Discord-Nachricht.",
  "Die Lobby klärt ihr direkt auf Discord.",
];

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/requests/${id}`);
  const request = await getRequestDetail({ userId: user.id, requestId: id, now: new Date() });
  if (!request) notFound();

  const { team } = request;
  const ownRequest = request.applications !== null;
  const status = request.open
    ? null
    : request.status === "OPEN"
      ? "Abgelaufen"
      : REQUEST_STATUS_LABELS[request.status];
  const details = [
    { label: "Datum", value: formatWeekdayDate(request.startsAt) },
    { label: "Uhrzeit", value: describeStartTime(request.startsAt) },
    { label: "Format", value: formatFormat(request.format) },
    { label: "Maps", value: formatMaps(request.maps) },
    { label: "Rang", value: formatRankRange(request.rankMin, request.rankMax) },
    { label: "Teamrang", value: RANK_LABELS[team.rank] },
  ];
  const ownApplication = request.ownApplication;

  return (
    <PageMain className="gap-7">
      <BackLink href="/scrims">Zurück zum Board</BackLink>

      <div className="flex items-center gap-4">
        <TeamAvatar team={team} size="lg" own={ownRequest} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="type-h1">{team.name}</h1>
          <span className="flex flex-wrap items-center gap-2 text-[14px] text-muted-foreground">
            {formatUniversities(team.universities)}
            {status ? <Badge className="h-[22px] px-2 text-[12px]">{status}</Badge> : null}
          </span>
          <span className="text-[13px] text-muted-foreground">
            {formatReliability(team.reliability)}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
        {details.map((detail) => (
          <div key={detail.label} className="flex min-w-0 flex-col gap-1 bg-card p-4">
            <dt className="type-label text-muted-foreground">{detail.label}</dt>
            <dd className="type-btn text-[18px] leading-[1.25] font-semibold">{detail.value}</dd>
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
          className={buttonVariants({ variant: "outline", size: "sm", className: "self-start" })}
        >
          Zum gebuchten Scrim
        </Link>
      ) : null}

      {request.apply ? (
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
          <div className="flex flex-col gap-1">
            <h2 className="type-h2">Bewerben</h2>
            {request.applyAs ? (
              <span className="text-[14px] text-muted-foreground">
                Du bewirbst dich als{" "}
                <span className="font-semibold text-foreground">{request.applyAs.name}</span> ·{" "}
                {request.applyAs.memberCount} Mitglieder
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
            <p className="text-[14px] text-pretty text-muted-foreground">{request.apply.problem}</p>
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
            <p className="text-[14px] text-muted-foreground">{request.withdraw.problem}</p>
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
              Annehmen geht gerade nicht: {request.confirm.problem}
            </p>
          ) : null}
          {request.applications.map((application) => (
            <div key={application.id} className="flex flex-col gap-3 rounded-sm bg-secondary p-3.5">
              <div className="flex items-center gap-3">
                <TeamAvatar team={application.team} size="sm" className="bg-background" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{application.team.name}</span>
                  <span className="text-[13px] text-muted-foreground">
                    {formatUniversities(application.team.universities)}
                  </span>
                </div>
                {application.status === "ACCEPTED" ? (
                  <span className="shrink-0 text-[13px] font-semibold text-success">
                    Angenommen
                  </span>
                ) : application.status !== "PENDING" ? (
                  <span className="shrink-0 text-[13px] text-faint">
                    {APPLICATION_STATUS_LABELS[application.status]}
                  </span>
                ) : null}
              </div>
              <p className="text-[13px] text-muted-foreground">
                Teamrang {RANK_LABELS[application.team.rank]} ·{" "}
                {formatReliability(application.team.reliability)}
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
                <p className="text-[14px] text-muted-foreground">{application.teamProblem}</p>
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
              <p className="text-[14px] text-muted-foreground">{request.remove.problem}</p>
            )
          ) : null}
        </section>
      ) : null}
    </PageMain>
  );
}
