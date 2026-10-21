import {
  FEEDBACK_OUTCOME_LABELS,
  RATING_MAX,
  RATING_MIN,
  describeStart,
  getScrimDetail,
} from "@uni-scrims/core";
import type { FeedbackOutcome } from "@uni-scrims/db";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { SCRIM_STATUS_LABELS, formatFormat, formatMaps } from "@/lib/scrim-format";
import { requirePageUser } from "@/lib/session";
import { cancelScrimAction } from "../actions";
import { FeedbackForm } from "./feedback-form";

const OUTCOMES = (Object.keys(FEEDBACK_OUTCOME_LABELS) as FeedbackOutcome[]).map((value) => ({
  value,
  label: FEEDBACK_OUTCOME_LABELS[value],
}));
const RATINGS = Array.from({ length: RATING_MAX - RATING_MIN + 1 }, (_, i) => RATING_MIN + i);

export default async function ScrimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/scrims/${id}`);
  const scrim = await getScrimDetail({ userId: user.id, scrimId: id, now: new Date() });
  if (!scrim) notFound();

  const result = (() => {
    switch (scrim.status) {
      case "CANCELLED":
        return `Abgesagt ${scrim.cancelledByUs ? "von euch" : "vom Gegner"}${scrim.lateCancel ? " (kurzfristig)" : ""}.`;
      case "NO_SHOW":
        return `No-Show von ${scrim.noShow === "US" ? scrim.ownTeam.name : scrim.opponent.name}.`;
      default:
        return null;
    }
  })();

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
          Scrim gegen {scrim.opponent.name}
          <Badge variant="outline">{SCRIM_STATUS_LABELS[scrim.status]}</Badge>
        </h1>
        <p className="font-medium">{describeStart(scrim.startsAt)}</p>
        <p className="text-sm">
          {formatFormat(scrim.format)} · Maps: {formatMaps(scrim.maps)} ·{" "}
          {scrim.isHost ? "Ihr habt die Anfrage gestellt" : "Ihr habt euch beworben"}
        </p>
        {scrim.note ? <p className="text-sm whitespace-pre-line">{scrim.note}</p> : null}
        {result ? <p className="text-sm">{result}</p> : null}
      </div>

      <section className="flex flex-col gap-1 text-sm">
        <h2 className="text-lg font-semibold">Gegner</h2>
        <p>
          {scrim.opponent.name} <span className="opacity-60">[{scrim.opponent.tag}]</span>
        </p>
        <p>
          Captain (Discord): <span className="font-medium">{scrim.opponent.captainName}</span>
        </p>
        <p className="opacity-70">Sprecht die Lobby direkt auf Discord ab.</p>
      </section>

      {scrim.cancellable && !scrim.canCancel ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Absagen</h2>
          <p className="text-sm opacity-70">{scrim.actionProblem}</p>
        </section>
      ) : null}

      {scrim.canCancel ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Absagen</h2>
          {scrim.cancelWouldBeLate ? (
            <p className="text-sm text-destructive">
              Weniger als 24 Stunden vor Start: Die Absage zählt als kurzfristig.
            </p>
          ) : null}
          <ActionForm
            action={cancelScrimAction}
            submitLabel="Scrim absagen"
            variant="destructive"
            confirmText={
              scrim.cancelWouldBeLate
                ? "Scrim absagen? Die Absage zählt als kurzfristig."
                : "Scrim absagen?"
            }
          >
            <input type="hidden" name="scrimId" value={scrim.id} />
          </ActionForm>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Feedback</h2>
        {scrim.ownFeedback ? (
          <p className="text-sm">
            Eure Antwort: {FEEDBACK_OUTCOME_LABELS[scrim.ownFeedback.outcome]}
            {scrim.ownFeedback.rating ? ` · ${"★".repeat(scrim.ownFeedback.rating)}` : ""}
          </p>
        ) : scrim.canGiveFeedback ? (
          <>
            <p className="text-sm opacity-70">
              Pro Team genau eine Antwort, danach nicht mehr änderbar. Möglich bis{" "}
              {formatDateTime(scrim.feedbackDeadline)}.
            </p>
            <FeedbackForm scrimId={scrim.id} outcomes={OUTCOMES} ratings={RATINGS} />
          </>
        ) : (
          <p className="text-sm opacity-70">{scrim.feedbackClosed ?? scrim.actionProblem}</p>
        )}
      </section>
    </main>
  );
}
