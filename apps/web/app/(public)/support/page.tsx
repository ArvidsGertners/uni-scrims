import { connection } from "next/server";
import Link from "next/link";
import { ExternalLinkIcon, MessageSquareIcon } from "@/components/icons";
import { PageMain } from "@/components/page-main";
import { buttonVariants } from "@/components/ui/button";

const cardClass = "flex flex-col gap-3 rounded-lg border border-border bg-card p-5";

/** How to reach us (SPEC N-13): the Discord server and the contact address; for everyone. */
export default async function SupportPage() {
  // Read per request: `next build` would otherwise bake in the values of the build environment.
  await connection();
  const discordUrl = process.env.HUB_INVITE_URL || null;
  const email = process.env.CONTACT_EMAIL || null;

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
    </PageMain>
  );
}
