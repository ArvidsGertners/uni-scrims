import {
  APPLICATION_MESSAGE_MAX,
  RANK_LABELS,
  describeStart,
  getRequestDetail,
} from "@uni-scrims/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { TeamSummary } from "@/components/team-summary";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requirePageUser } from "@/lib/session";
import {
  APPLICATION_STATUS_LABELS,
  REQUEST_STATUS_LABELS,
  formatFormat,
  formatMaps,
  formatRankRange,
} from "@/lib/scrim-format";
import {
  applyAction,
  confirmApplicationAction,
  deleteRequestAction,
  withdrawApplicationAction,
} from "../actions";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/requests/${id}`);
  const request = await getRequestDetail({ userId: user.id, requestId: id, now: new Date() });
  if (!request) notFound();

  const status = request.open
    ? null
    : request.status === "OPEN"
      ? "Abgelaufen"
      : REQUEST_STATUS_LABELS[request.status];
  const canApply = request.open && request.hasTeam && !request.isOwner && !request.ownApplication;
  // Scrim actions only for the current, verified captain of an active team (§7).
  const canAct = request.actionProblem === null;

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
          Scrim-Anfrage {status ? <Badge variant="outline">{status}</Badge> : null}
        </h1>
        <p className="font-medium">{describeStart(request.startsAt)}</p>
        <p className="text-sm">
          {formatFormat(request.format)} · Rang {formatRankRange(request.rankMin, request.rankMax)}{" "}
          · Maps: {formatMaps(request.maps)}
        </p>
        {request.note ? <p className="text-sm whitespace-pre-line">{request.note}</p> : null}
      </div>

      <TeamSummary team={request.team} />

      {request.scrimId ? (
        <Link href={`/scrims/${request.scrimId}`} className="underline">
          Zum gebuchten Scrim
        </Link>
      ) : null}

      {canApply ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Bewerben</h2>
          {request.outOfRange ? (
            <p className="text-sm">
              Euer Team-Rang liegt außerhalb des gewünschten Bereichs. Ihr könnt euch trotzdem
              bewerben, der Ersteller entscheidet.
            </p>
          ) : null}
          {canAct ? (
            <ActionForm action={applyAction} submitLabel="Bewerben">
              <input type="hidden" name="requestId" value={request.id} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="message">Nachricht (optional)</Label>
                <Textarea
                  id="message"
                  name="message"
                  maxLength={APPLICATION_MESSAGE_MAX}
                  rows={2}
                />
              </div>
            </ActionForm>
          ) : (
            <p className="text-sm opacity-70">{request.actionProblem}</p>
          )}
        </section>
      ) : null}

      {request.ownApplication ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Eure Bewerbung</h2>
          <p className="text-sm">
            Status: {APPLICATION_STATUS_LABELS[request.ownApplication.status]}
          </p>
          {request.ownApplication.message ? (
            <p className="text-sm whitespace-pre-line">{request.ownApplication.message}</p>
          ) : null}
          {request.ownApplication.status === "PENDING" && canAct ? (
            <ActionForm
              action={withdrawApplicationAction}
              submitLabel="Bewerbung zurückziehen"
              variant="outline"
              confirmText="Bewerbung zurückziehen? Ihr könnt euch danach nicht erneut auf diese Anfrage bewerben."
            >
              <input type="hidden" name="requestId" value={request.id} />
              <input type="hidden" name="applicationId" value={request.ownApplication.id} />
            </ActionForm>
          ) : null}
        </section>
      ) : null}

      {request.applications ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Bewerbungen ({request.applications.length})</h2>
          {request.applications.length === 0 ? (
            <p className="text-sm opacity-70">Noch keine Bewerbungen.</p>
          ) : null}
          {request.applications.map((application) => (
            <Card key={application.id}>
              <CardContent className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={application.status === "PENDING" ? "secondary" : "outline"}>
                    {APPLICATION_STATUS_LABELS[application.status]}
                  </Badge>
                  {application.outOfRange ? (
                    <Badge variant="outline">
                      Rang {RANK_LABELS[application.team.rank]} außerhalb des Bereichs
                    </Badge>
                  ) : null}
                </div>
                <TeamSummary team={application.team} />
                {application.message ? (
                  <p className="text-sm whitespace-pre-line">{application.message}</p>
                ) : null}
                {application.status === "PENDING" && request.open && canAct ? (
                  <ActionForm
                    action={confirmApplicationAction}
                    submitLabel="Bestätigen"
                    confirmText={`Scrim mit ${application.team.name} buchen? Alle anderen Bewerbungen werden abgelehnt.`}
                  >
                    <input type="hidden" name="requestId" value={request.id} />
                    <input type="hidden" name="applicationId" value={application.id} />
                  </ActionForm>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      {request.isOwner && request.open && request.actionProblem ? (
        <p className="text-sm opacity-70">{request.actionProblem}</p>
      ) : null}

      {request.isOwner && canAct && request.open ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Anfrage löschen</h2>
          <ActionForm
            action={deleteRequestAction}
            submitLabel="Anfrage löschen"
            variant="destructive"
            confirmText="Anfrage löschen? Offene Bewerbungen werden abgelehnt."
          >
            <input type="hidden" name="requestId" value={request.id} />
          </ActionForm>
        </section>
      ) : null}
    </main>
  );
}
