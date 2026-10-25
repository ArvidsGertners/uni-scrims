import { TEAM_LIMIT_REASON_MAX, formatBerlinDate, getTeamLimitStatus } from "@uni-scrims/core";
import { connection } from "next/server";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { CountedTextarea } from "@/components/counted-textarea";
import { ExternalLinkIcon, MessageSquareIcon } from "@/components/icons";
import { PageMain } from "@/components/page-main";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { supportMessages } from "@/i18n/public";
import { siteChrome } from "@/lib/header-user";
import { submitTeamLimitRequestAction } from "./actions";
import { getLocale, getMessages, getText } from "@/lib/locale";

const cardClass = "flex flex-col gap-3 rounded-lg border border-border bg-card p-5";

/** How to reach us (SPEC N-13): the Discord server and the contact address; for everyone. */
export default async function SupportPage() {
  // Read per request: `next build` would otherwise bake in the values of the build environment.
  await connection();
  const discordUrl = process.env.HUB_INVITE_URL || null;
  const email = process.env.CONTACT_EMAIL || null;
  // The request for more teams only for active accounts (SPEC N-17); visitors see the rest.
  const { user, active } = await siteChrome();
  const teamLimit = user && active ? await getTeamLimitStatus(user.id) : null;
  const t = await getMessages(supportMessages);

  return (
    <PageMain className="gap-7">
      <div className="flex flex-col gap-2.5">
        <h1 className="type-h1">{t.title}</h1>
        <p className="text-pretty text-muted-foreground">{t.lead}</p>
      </div>

      {discordUrl || email ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {discordUrl ? (
            <section className={cardClass}>
              <h2 className="type-h2">{t.discord}</h2>
              <p className="flex-1 text-[14px] text-pretty text-muted-foreground">
                {t.discordText}
              </p>
              <a
                href={discordUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline", className: "self-start" })}
              >
                <MessageSquareIcon size={17} />
                {t.discordLink}
                <ExternalLinkIcon size={15} />
              </a>
            </section>
          ) : null}
          {email ? (
            <section className={cardClass}>
              <h2 className="type-h2">{t.email}</h2>
              <p className="flex-1 text-[14px] text-pretty text-muted-foreground">{t.emailText}</p>
              <a
                href={`mailto:${email}`}
                className="self-start font-semibold break-all text-accent-text underline underline-offset-2"
              >
                {email}
              </a>
            </section>
          ) : null}
        </div>
      ) : (
        <p>
          {t.contactInImpressum((label) => (
            <Link href="/impressum" className="font-semibold underline underline-offset-2">
              {label}
            </Link>
          ))}
        </p>
      )}

      {teamLimit ? <TeamLimitCard status={teamLimit} /> : null}
    </PageMain>
  );
}

/** Requesting more teams (SPEC N-17): the count, the state of the latest request, the form. */
async function TeamLimitCard({
  status,
}: {
  status: Awaited<ReturnType<typeof getTeamLimitStatus>>;
}) {
  const text = await getText();
  const locale = await getLocale();
  const t = await getMessages(supportMessages);
  const { latest } = status;
  return (
    <section id="mehr-teams" className={`${cardClass} scroll-mt-24`}>
      <h2 className="type-h2">{t.teamLimitTitle}</h2>
      <p className="text-[14px] text-pretty text-muted-foreground">
        {t.teamLimitText(status.teamCount, status.teamLimit)}
      </p>
      {latest?.status === "PENDING" ? (
        <Alert>
          <span>{t.pending(formatBerlinDate(latest.createdAt, locale))}</span>
        </Alert>
      ) : (
        <>
          {latest?.status === "APPROVED" ? (
            <Alert variant="success">
              <span>
                {t.approved(
                  formatBerlinDate(latest.decidedAt ?? latest.createdAt, locale),
                  // Always set on approved requests; the current limit just in case.
                  latest.newLimit ?? status.teamLimit,
                )}
              </span>
            </Alert>
          ) : latest?.status === "REJECTED" ? (
            <Alert>
              <span>{t.rejected(formatBerlinDate(latest.createdAt, locale))}</span>
            </Alert>
          ) : null}
          {status.requestProblem ? (
            <p className="text-[14px] text-muted-foreground">{text(status.requestProblem)}</p>
          ) : (
            <ActionForm
              action={submitTeamLimitRequestAction}
              submitLabel={t.submit}
              variant="outline"
              size="sm"
              className="flex flex-col gap-3"
            >
              <CountedTextarea
                label={t.reason}
                name="reason"
                maxLength={TEAM_LIMIT_REASON_MAX}
                optional={false}
                required
                rows={3}
                placeholder={t.reasonPlaceholder}
              />
            </ActionForm>
          )}
        </>
      )}
    </section>
  );
}
