import { TEAM_LIMIT_REASON_MAX, formatBerlinDate, getTeamLimitStatus } from "@uni-scrims/core";
import { connection } from "next/server";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { CountedTextarea } from "@/components/counted-textarea";
import { ExternalLinkIcon, MessageSquareIcon } from "@/components/icons";
import { PageMain } from "@/components/page-main";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { siteChrome } from "@/lib/header-user";
import { submitTeamLimitRequestAction } from "./actions";

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

  return (
    <PageMain className="gap-7">
      <div className="flex flex-col gap-2.5">
        <h1 className="type-h1">Support</h1>
        <p className="text-pretty text-muted-foreground">
          Fragen, Probleme oder Feedback? So erreichst du uns. Geht es um dein Konto, nenn uns deine
          Profil-ID aus den Einstellungen.
        </p>
      </div>

      {discordUrl || email ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {discordUrl ? (
            <section className={cardClass}>
              <h2 className="type-h2">Discord</h2>
              <p className="flex-1 text-[14px] text-pretty text-muted-foreground">
                Auf dem Uni-Scrims-Server erreichst du uns und die anderen Teams.
              </p>
              <a
                href={discordUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline", className: "self-start" })}
              >
                <MessageSquareIcon size={17} />
                Zum Discord-Server
                <ExternalLinkIcon size={15} />
              </a>
            </section>
          ) : null}
          {email ? (
            <section className={cardClass}>
              <h2 className="type-h2">E-Mail</h2>
              <p className="flex-1 text-[14px] text-pretty text-muted-foreground">
                Für alles, was nicht öffentlich sein soll, etwa Fragen zu deinem Konto oder deinen
                Daten.
              </p>
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
          Unsere Kontaktdaten stehen im{" "}
          <Link href="/impressum" className="font-semibold underline underline-offset-2">
            Impressum
          </Link>
          .
        </p>
      )}

      {teamLimit ? <TeamLimitCard status={teamLimit} /> : null}
    </PageMain>
  );
}

/** „Mehr Teams beantragen“ (SPEC N-17): the count, the state of the latest request, the form. */
function TeamLimitCard({ status }: { status: Awaited<ReturnType<typeof getTeamLimitStatus>> }) {
  const { latest } = status;
  return (
    <section id="mehr-teams" className={`${cardClass} scroll-mt-24`}>
      <h2 className="type-h2">Mehr Teams beantragen</h2>
      <p className="text-[14px] text-pretty text-muted-foreground">
        Du bist in {status.teamCount} von {status.teamLimit} Teams. Brauchst du mehr, etwa weil du
        mehrere Teams betreust, schreib kurz, wofür. Ein Admin entscheidet; den Stand siehst du
        hier.
      </p>
      {latest?.status === "PENDING" ? (
        <Alert>
          <span>Dein Antrag vom {formatBerlinDate(latest.createdAt)} ist in Prüfung.</span>
        </Alert>
      ) : (
        <>
          {latest?.status === "APPROVED" ? (
            <Alert variant="success">
              <span>
                Angenommen am {formatBerlinDate(latest.decidedAt ?? latest.createdAt)}: Du kannst
                jetzt in bis zu {latest.newLimit} Teams sein.
              </span>
            </Alert>
          ) : latest?.status === "REJECTED" ? (
            <Alert>
              <span>
                Dein Antrag vom {formatBerlinDate(latest.createdAt)} wurde abgelehnt. Du kannst
                einen neuen stellen.
              </span>
            </Alert>
          ) : null}
          {status.requestProblem ? (
            <p className="text-[14px] text-muted-foreground">{status.requestProblem}</p>
          ) : (
            <ActionForm
              action={submitTeamLimitRequestAction}
              submitLabel="Antrag senden"
              variant="outline"
              size="sm"
              className="flex flex-col gap-3"
            >
              <CountedTextarea
                label="Begründung"
                name="reason"
                maxLength={TEAM_LIMIT_REASON_MAX}
                optional={false}
                required
                rows={3}
                placeholder="Zum Beispiel: Ich betreue die Teams unserer Hochschule."
              />
            </ActionForm>
          )}
        </>
      )}
    </section>
  );
}
