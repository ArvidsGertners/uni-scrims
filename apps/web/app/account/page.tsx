import { getAccount } from "@uni-scrims/core";
import Link from "next/link";
import { DetailRows } from "@/components/detail-rows";
import { DiscordDmWarning } from "@/components/discord-dm-warning";
import { CheckIcon } from "@/components/icons";
import { LogoutButton } from "@/components/logout-button";
import { PageMain } from "@/components/page-main";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { initials } from "@/lib/format";
import { requirePageAccountUser } from "@/lib/session";
import { DeleteAccountDialog } from "./delete-account-dialog";

const VERIFICATION_LABELS = {
  VERIFIED: { label: "Verifiziert", className: "text-success" },
  PENDING: { label: "In Prüfung", className: "text-warning" },
  REJECTED: { label: "Abgelehnt", className: "text-accent-text" },
  NONE: { label: "Nicht verifiziert", className: "text-warning" },
} as const;

export default async function AccountPage() {
  const user = await requirePageAccountUser("/account");
  const account = await getAccount(user.id);
  const team = account.team;
  const verification = VERIFICATION_LABELS[account.verification.status];

  const consequences = [
    "Gelöscht werden dein Name und Avatar, deine Verifizierung samt Prüfungen und Dateien, Nachrichten an dich und deine Anmeldungen.",
    account.banned
      ? "Deine Discord-ID bleibt mit der Sperre gespeichert, damit sie bei einer neuen Anmeldung weiter gilt."
      : "Die Verknüpfung mit deinem Discord-Konto wird gelöscht.",
    ...(team
      ? [
          team.isCaptain
            ? `Dein Team ${team.name} wird aufgelöst.`
            : `Du verlässt dein Team ${team.name}.`,
        ]
      : []),
    "Vergangene Scrims bleiben anonymisiert für die Team-Statistik.",
    "Vom Uni-Scrims-Discord-Server wirst du nicht entfernt. Den kannst du selbst verlassen.",
  ];

  return (
    <PageMain className="gap-7">
      <h1 className="type-h1">Konto</h1>
      {account.banned ? (
        <Alert>
          <span>Dein Konto ist gesperrt. Löschen kannst du es trotzdem.</span>
        </Alert>
      ) : null}

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
        <h2 className="type-label text-muted-foreground">Discord</h2>
        <div className="flex items-center gap-3.5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary font-label text-[14px] font-bold">
            {initials(account.name)}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-label font-semibold">{account.name}</span>
            <span className="text-[13px] text-muted-foreground">Angemeldet über Discord</span>
          </div>
        </div>
        {user.hubJoinFailedAt || user.dmFailedAt ? (
          <DiscordDmWarning hubJoinFailed={user.hubJoinFailedAt !== null} />
        ) : (
          <span className="flex items-center gap-2 text-[14px] text-success">
            <CheckIcon strokeWidth={3} />
            Discord-Nachrichten kommen an
          </span>
        )}
      </section>

      <DetailRows
        className="px-5 pt-4 pb-1"
        rows={[
          {
            label: "Status",
            value: (
              <span className={`font-semibold ${verification.className}`}>
                {verification.label}
              </span>
            ),
          },
          { label: "Hochschule", value: account.verification.university ?? "–" },
          {
            label: "Team",
            value: team ? `${team.name}${team.isCaptain ? " · Captain" : ""}` : "Kein Team",
          },
        ]}
      >
        <h2 className="mb-1 type-label text-muted-foreground">Studierendenstatus</h2>
      </DetailRows>

      <section className="flex flex-col gap-2.5 pt-2">
        <h2 className="type-h2">Konto löschen</h2>
        <p className="text-[14px] text-pretty text-muted-foreground">
          Löscht dein Konto mit deinen persönlichen Daten und deiner Verifizierung. Das lässt sich
          nicht rückgängig machen.
        </p>
        {account.deletionProblem ? (
          <Alert>
            <span>
              {account.deletionProblem}{" "}
              <Link href="/team" className="font-semibold underline underline-offset-2">
                Zum Team
              </Link>
            </span>
          </Alert>
        ) : null}
        <div className="mt-1.5 flex flex-wrap gap-2.5">
          {account.deletionProblem ? null : <DeleteAccountDialog consequences={consequences} />}
          <LogoutButton className={buttonVariants({ variant: "outline", size: "sm" })} />
        </div>
      </section>
    </PageMain>
  );
}
