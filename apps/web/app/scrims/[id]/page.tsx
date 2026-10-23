import {
  FEEDBACK_OUTCOME_LABELS,
  RATING_MAX,
  RATING_MIN,
  describeStartShort,
  getScrimDetail,
} from "@uni-scrims/core";
import type { FeedbackOutcome } from "@uni-scrims/db";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { DiscordContact } from "@/components/discord-contact";
import { PageMain } from "@/components/page-main";
import { Alert } from "@/components/ui/alert";
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

  const when = `${describeStartShort(scrim.startsAt)} · ${formatFormat(scrim.format)}`;

  // Feedback due: the page is the feedback screen of the design handoff.
  if (scrim.canGiveFeedback) {
    return (
      <PageMain className="gap-7">
        <BackLink href="/scrims">Meine Scrims</BackLink>
        <div className="flex flex-col gap-2.5">
          <span className="type-label text-muted-foreground">Feedback · {when}</span>
          <h1 className="type-h1">Wie war das Scrim gegen {scrim.opponent.name}?</h1>
          <p className="text-pretty text-muted-foreground">
            Pro Team eine Antwort, danach nicht mehr änderbar. Möglich bis{" "}
            {formatDateTime(scrim.feedbackDeadline)}.
          </p>
        </div>
        <FeedbackForm scrimId={scrim.id} outcomes={OUTCOMES} ratings={RATINGS} />
      </PageMain>
    );
  }

  const result = (() => {
    switch (scrim.status) {
      case "CANCELLED":
        return `Abgesagt ${scrim.cancelledByUs ? "von euch" : "vom Gegner"}${scrim.lateCancel ? " (kurzfristig)" : ""}.`;
      case "NO_SHOW":
        return `No-Show von ${scrim.noShow === "US" ? scrim.ownTeam.name : scrim.opponent.name}.`;
      case "DISPUTED":
        return "Streitfall, der Admin entscheidet.";
      default:
        return null;
    }
  })();

  return (
    <PageMain className="gap-7">
      <BackLink href="/scrims">Meine Scrims</BackLink>
      <div className="flex flex-col gap-2.5">
        <span className="type-label text-muted-foreground">Scrim · {when}</span>
        <h1 className="type-h1">gegen {scrim.opponent.name}</h1>
        <span className="flex flex-wrap items-center gap-2 text-[14px] text-muted-foreground">
          <Badge variant={scrim.status === "SCHEDULED" ? "success" : "neutral"}>
            {SCRIM_STATUS_LABELS[scrim.status]}
          </Badge>
          {result}
        </span>
      </div>

      <DiscordContact
        captainName={scrim.opponent.captainName}
        captainDiscordId={scrim.opponent.captainDiscordId}
        teamName={scrim.opponent.name}
      />

      <div className="flex flex-col gap-2">
        <span className="type-label text-muted-foreground">Maps</span>
        <p>{formatMaps(scrim.maps)}</p>
        <p className="text-[14px] text-muted-foreground">
          {scrim.isHost ? "Ihr habt die Anfrage gestellt." : "Ihr habt euch beworben."}
        </p>
      </div>

      {scrim.note ? (
        <div className="flex flex-col gap-2">
          <span className="type-label text-muted-foreground">Notiz zur Anfrage</span>
          <p className="text-[16px] text-pretty whitespace-pre-line">„{scrim.note}“</p>
        </div>
      ) : null}

      <section className="flex flex-col gap-2.5">
        <h2 className="type-h2">Feedback</h2>
        {scrim.ownFeedback ? (
          <Alert variant="success">
            <span>
              Feedback gegeben: {FEEDBACK_OUTCOME_LABELS[scrim.ownFeedback.outcome]}
              {scrim.ownFeedback.rating ? ` · ${"★".repeat(scrim.ownFeedback.rating)}` : ""}
            </span>
          </Alert>
        ) : (
          <p className="text-[14px] text-pretty text-muted-foreground">
            {scrim.feedbackClosed ?? scrim.actionProblem}
          </p>
        )}
      </section>

      {scrim.cancellable ? (
        <section className="flex flex-col gap-2.5">
          <h2 className="type-h2">Scrim absagen</h2>
          {scrim.canCancel ? (
            <>
              <p className="text-[14px] text-pretty text-muted-foreground">
                {scrim.cancelWouldBeLate
                  ? "Weniger als 24 Stunden vor Start: Die Absage zählt als kurzfristig."
                  : "Möglich bis zum Start. Das andere Team bekommt eine Discord-Nachricht."}
              </p>
              <ActionForm
                action={cancelScrimAction}
                submitLabel="Scrim absagen"
                variant="destructive"
                size="sm"
                className="mt-1.5 flex flex-col gap-3"
                confirmText={
                  scrim.cancelWouldBeLate
                    ? "Scrim absagen? Die Absage zählt als kurzfristig."
                    : "Scrim absagen?"
                }
              >
                <input type="hidden" name="scrimId" value={scrim.id} />
              </ActionForm>
            </>
          ) : (
            <p className="text-[14px] text-muted-foreground">{scrim.actionProblem}</p>
          )}
        </section>
      ) : null}
    </PageMain>
  );
}
