import {
  FEEDBACK_OUTCOME_LABELS,
  RATING_MAX,
  RATING_MIN,
  describeStartShort,
  getOtherOwnScrimTeam,
  getScrimDetail,
} from "@uni-scrims/core";
import type { FeedbackOutcome } from "@uni-scrims/db";
import { cn } from "cn";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { DiscordContact } from "@/components/discord-contact";
import { DETAIL_COLUMNS, PageMain } from "@/components/page-main";
import { SwitchTeamHint } from "@/components/switch-team-hint";
import { TeamLinks } from "@/components/team-links";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { rematchHref } from "@/lib/rematch";
import { SCRIM_STATUS_LABELS, formatFormat, formatMaps } from "@/lib/scrim-format";
import { requirePageUser } from "@/lib/session";
import { cancelScrimAction } from "../actions";
import { FeedbackForm } from "./feedback-form";
import { getLocale, getMessages, getText } from "@/lib/locale";
import { scrimDetailMessages, scrimSharedMessages } from "@/i18n/scrims";
import type { Locale } from "@uni-scrims/core/config/locale";

function outcomes(locale: Locale) {
  return (Object.keys(FEEDBACK_OUTCOME_LABELS[locale]) as FeedbackOutcome[]).map((value) => ({
    value,
    label: FEEDBACK_OUTCOME_LABELS[locale][value],
  }));
}
const RATINGS = Array.from({ length: RATING_MAX - RATING_MIN + 1 }, (_, i) => RATING_MIN + i);

export default async function ScrimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/scrims/${id}`);
  const scrim = await getScrimDetail({ userId: user.id, scrimId: id, now: new Date() });
  const text = await getText();
  const locale = await getLocale();
  const t = await getMessages(scrimDetailMessages);
  const shared = await getMessages(scrimSharedMessages);
  if (!scrim) {
    // Played by another own team (SPEC N-17): offer to switch instead of "not found".
    const otherTeam = await getOtherOwnScrimTeam({ userId: user.id, scrimId: id });
    if (!otherTeam) notFound();
    return (
      <PageMain className="gap-7">
        <BackLink href="/scrims?tab=anstehend">{t.scrims}</BackLink>
        <SwitchTeamHint team={otherTeam} returnTo={`/scrims/${id}`}>
          {t.otherOwnTeam(otherTeam.name)}
        </SwitchTeamHint>
      </PageMain>
    );
  }

  const when = `${describeStartShort(scrim.startsAt, locale)} · ${formatFormat(scrim.format, locale)}`;

  // Feedback due: the page is the feedback screen of the design handoff.
  if (scrim.canGiveFeedback) {
    return (
      <PageMain className="gap-7">
        <BackLink href="/scrims?tab=vergangen">{t.scrims}</BackLink>
        <div className="flex flex-col gap-2.5">
          <span className="type-label text-muted-foreground">
            {t.feedback} · {when}
          </span>
          <h1 className="type-h1">{t.feedbackTitle(scrim.opponent.name)}</h1>
          <p className="text-pretty text-muted-foreground">
            {t.feedbackIntro(formatDateTime(scrim.feedbackDeadline, locale))}
          </p>
        </div>
        <FeedbackForm
          scrimId={scrim.id}
          teamId={scrim.ownTeam.id}
          outcomes={outcomes(locale)}
          ratings={RATINGS}
        />
      </PageMain>
    );
  }

  const result = (() => {
    switch (scrim.status) {
      case "CANCELLED":
        return t.cancelled(scrim.cancelledByUs, scrim.lateCancel);
      case "NO_SHOW":
        return t.noShow(scrim.noShow === "US" ? scrim.ownTeam.name : scrim.opponent.name);
      case "DISPUTED":
        return t.disputed;
      default:
        return null;
    }
  })();

  return (
    <PageMain width="wide" className="gap-7">
      {/* Upcoming scrims are exactly the cancellable ones (getMyScrims). */}
      <BackLink href={`/scrims?tab=${scrim.cancellable ? "anstehend" : "vergangen"}`}>
        {t.scrims}
      </BackLink>
      <div className="flex flex-col gap-2.5">
        <span className="type-label text-muted-foreground">
          {t.scrim} · {when}
        </span>
        {/* The opponent's external links next to its name (SPEC N-15). */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h1 className="min-w-0 type-h1 break-words">{shared.versus(scrim.opponent.name)}</h1>
          <TeamLinks teamName={scrim.opponent.name} links={scrim.opponent.links} />
        </div>
        <span className="flex flex-wrap items-center gap-2 text-[14px] text-muted-foreground">
          <Badge variant={scrim.status === "SCHEDULED" ? "success" : "neutral"}>
            {SCRIM_STATUS_LABELS[locale][scrim.status]}
          </Badge>
          {result}
        </span>
        {/* "Nochmal gegen dieses Team" once the scrim no longer comes up (SPEC N-26). */}
        {scrim.rematch ? (
          <Link
            href={rematchHref(scrim)}
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "mt-1 self-start",
            })}
          >
            {t.rematch}
          </Link>
        ) : null}
      </div>

      {/* From 1024 px the details left, feedback and cancelling right (SPEC N-12). */}
      <div className={cn("flex flex-col gap-7 lg:gap-8", DETAIL_COLUMNS)}>
        <div className="flex min-w-0 flex-col gap-7">
          <DiscordContact
            captainName={scrim.opponent.captainName}
            captainDiscordId={scrim.opponent.captainDiscordId}
            teamName={scrim.opponent.name}
          />

          <div className="flex flex-col gap-2">
            <span className="type-label text-muted-foreground">{shared.maps}</span>
            <p>{formatMaps(scrim.maps, locale)}</p>
            <p className="text-[14px] text-muted-foreground">
              {scrim.direct
                ? scrim.isHost
                  ? t.youRequestedDirectly
                  : t.requestedYouDirectly
                : scrim.isHost
                  ? t.youRequested
                  : t.youApplied}
            </p>
          </div>

          {scrim.note ? (
            <div className="flex flex-col gap-2">
              <span className="type-label text-muted-foreground">{t.requestNote}</span>
              <p className="text-[16px] text-pretty whitespace-pre-line">
                {shared.quoted(scrim.note)}
              </p>
            </div>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-7">
          <section className="flex flex-col gap-2.5">
            <h2 className="type-h2">{t.feedback}</h2>
            {scrim.ownFeedback ? (
              <Alert variant="success">
                <span>
                  {t.feedbackGiven(FEEDBACK_OUTCOME_LABELS[locale][scrim.ownFeedback.outcome])}
                  {scrim.ownFeedback.rating ? ` · ${"★".repeat(scrim.ownFeedback.rating)}` : ""}
                </span>
              </Alert>
            ) : (
              <p className="text-[14px] text-pretty text-muted-foreground">
                {text(scrim.feedbackClosed ?? scrim.actionProblem)}
              </p>
            )}
          </section>

          {scrim.cancellable ? (
            <section className="flex flex-col gap-2.5">
              <h2 className="type-h2">{t.cancelScrim}</h2>
              {scrim.canCancel ? (
                <>
                  <p className="text-[14px] text-pretty text-muted-foreground">
                    {scrim.cancelWouldBeLate ? t.cancelWouldBeLate : t.cancelPossible}
                  </p>
                  <ActionForm
                    action={cancelScrimAction}
                    submitLabel={t.cancelScrim}
                    variant="destructive"
                    size="sm"
                    className="mt-1.5 flex flex-col gap-3"
                    confirmText={scrim.cancelWouldBeLate ? t.confirmLateCancel : t.confirmCancel}
                  >
                    <input type="hidden" name="scrimId" value={scrim.id} />
                    {/* The team the page was shown for (§5.20). */}
                    <input type="hidden" name="teamId" value={scrim.ownTeam.id} />
                  </ActionForm>
                </>
              ) : (
                <p className="text-[14px] text-muted-foreground">{text(scrim.actionProblem)}</p>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </PageMain>
  );
}
