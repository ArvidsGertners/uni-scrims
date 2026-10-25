import { RANKS, RANK_LABELS, THEME_LABELS, getAccount } from "@uni-scrims/core";
import { ThemePreference } from "@uni-scrims/db";
import { cn } from "cn";
import Link from "next/link";
import { EmailField, PasswordField, RealNameFields } from "@/components/account-fields";
import { ActionForm } from "@/components/action-form";
import { CopyValue } from "@/components/copy-value";
import { DetailRows } from "@/components/detail-rows";
import { DiscordButton } from "@/components/discord-button";
import { DiscordDmWarning } from "@/components/discord-dm-warning";
import { CheckIcon } from "@/components/icons";
import { DETAIL_COLUMNS, PageMain } from "@/components/page-main";
import { UserAvatar } from "@/components/user-avatar";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { requirePageAccountUser, setupUrl } from "@/lib/session";
import {
  changeEmailAction,
  changePasswordAction,
  handOverCaptainAction,
  setPlayerRankAction,
  updateRealNameAction,
} from "./actions";
import { AccountTabs } from "./account-tabs";
import { DeleteAccountDialog } from "./delete-account-dialog";
import { ThemeForm } from "./theme-form";

const cardClass = "flex flex-col gap-4 rounded-lg border border-border bg-card p-5";

const THEME_OPTIONS = Object.values(ThemePreference).map((value) => ({
  value,
  label: THEME_LABELS[value],
}));

/** The select needs a value for "none"; the action sends it to core as empty. */
const NO_RANK = "NONE";
const RANK_OPTIONS = [
  { value: NO_RANK, label: "Kein Rang" },
  ...RANKS.map((rank) => ({ value: rank, label: RANK_LABELS[rank] })),
];

// The verification belongs to Konto (SPEC N-9): status here, the upload on /verify.
const VERIFICATION_LABELS = {
  VERIFIED: { label: "Verifiziert", className: "text-success", action: "Details", primary: false },
  PENDING: {
    label: "In Prüfung",
    className: "text-warning",
    action: "Status ansehen",
    primary: false,
  },
  REJECTED: {
    label: "Abgelehnt",
    className: "text-accent-text",
    action: "Bescheinigung hochladen",
    primary: true,
  },
  NONE: {
    label: "Nicht verifiziert",
    className: "text-warning",
    action: "Bescheinigung hochladen",
    primary: true,
  },
} as const;

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Better Auth sends errors of the mail and Discord links back as ?error=… (§5.8).
  const { email: emailConfirmed, error } = await searchParams;
  const user = await requirePageAccountUser("/account");
  const account = await getAccount(user.id);
  const team = account.team;
  const verification = VERIFICATION_LABELS[account.verification.status];

  const consequences = [
    "Gelöscht werden dein Name, deine E-Mail-Adresse, dein Passwort und dein Avatar, deine Verifizierung samt Prüfungen und Dateien, Nachrichten an dich und deine Anmeldungen.",
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
    <PageMain width="wide" className="gap-7">
      {/* min-h-11: the same height as on /verify, so the tabs do not jump (SPEC N-11). Logging out
          is in the account menu since Phase 17 (SPEC N-13). */}
      <div className="flex min-h-11 items-center">
        <h1 className="type-h1">Einstellungen</h1>
      </div>
      {account.banned || account.setupStep ? null : (
        <AccountTabs current="/account" unverified={account.verification.status !== "VERIFIED"} />
      )}
      {account.banned ? (
        <Alert>
          <span>Dein Konto ist gesperrt. Löschen kannst du es trotzdem.</span>
        </Alert>
      ) : account.setupStep ? (
        <Alert>
          <span>
            Dein Konto ist noch nicht fertig eingerichtet.{" "}
            <Link href={setupUrl("/team")} className="font-semibold underline underline-offset-2">
              Weiter
            </Link>
          </span>
        </Alert>
      ) : null}
      {typeof error === "string" ? (
        <Alert>
          <span>
            {error.includes("already_linked") || error.includes("unable_to_link")
              ? "Das Discord-Konto ließ sich nicht verbinden. Verbinde das Discord-Konto, das schon mit Uni Scrims verknüpft ist."
              : "Der Link ist ungültig oder abgelaufen. Bitte versuch es erneut."}
          </span>
        </Alert>
      ) : emailConfirmed === "bestaetigt" ? (
        <Alert variant="success">
          <span>Deine E-Mail-Adresse ist bestätigt.</span>
        </Alert>
      ) : null}

      {/* From 1024 px two columns (SPEC N-12): Discord on the right across all rows, everything
          else on the left, in the order of the page as before (§5.15). */}
      <div
        className={cn(
          "flex flex-col gap-7 lg:grid-rows-[repeat(4,auto)_1fr] lg:gap-6",
          DETAIL_COLUMNS,
        )}
      >
        {/* SPEC N-13: for every signed-in account, banned and incomplete ones included. */}
        <section className={`${cardClass} lg:col-start-1`}>
          <h2 className="type-label text-muted-foreground">Grundeinstellungen</h2>
          <div className="flex max-w-xl flex-col gap-2">
            <span className="text-[14px] font-medium">Profil-ID</span>
            <CopyValue value={user.id} />
            <p className="text-[13px] text-muted-foreground">
              Nenn sie uns, wenn du dich beim Support meldest. Ändern lässt sie sich nicht.
            </p>
          </div>
          <div className="flex max-w-xl flex-col gap-2 border-t border-border pt-4">
            <span className="text-[14px] font-medium">Design</span>
            <ThemeForm current={user.theme} options={THEME_OPTIONS} />
            <p className="text-[13px] text-muted-foreground">
              „System“ folgt der Einstellung deines Geräts. Deine Wahl gilt auf allen Geräten.
            </p>
          </div>
          {/* Only active, complete accounts set a rank: it only counts in a team (SPEC N-16). */}
          {account.banned || account.setupStep ? null : (
            <div className="flex max-w-xl flex-col gap-2 border-t border-border pt-4">
              <ActionForm
                action={setPlayerRankAction}
                submitLabel="Rang speichern"
                variant="outline"
                size="sm"
                className="flex flex-col gap-3"
              >
                <Field label="Dein Rang">
                  <Select
                    name="rank"
                    defaultValue={account.rank ?? NO_RANK}
                    options={RANK_OPTIONS}
                  />
                </Field>
              </ActionForm>
              <p className="text-[13px] text-pretty text-muted-foreground">
                Selbst angegeben. Als Spieler oder Ersatzspieler zählt er für euren Team-Rang; dein
                Team sieht ihn, alle anderen nur den Team-Rang.
              </p>
            </div>
          )}
        </section>
        <DetailRows
          className="px-5 pt-4 pb-1 lg:col-start-1"
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
          <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <h2 className="type-label text-muted-foreground">Studierendenstatus</h2>
            {/* /verify needs an active account (requirePageUser). */}
            {account.banned || account.setupStep ? null : (
              <Link
                href="/verify"
                className={buttonVariants({
                  variant: verification.primary ? "default" : "outline",
                  size: "sm",
                })}
              >
                {verification.action}
              </Link>
            )}
          </div>
        </DetailRows>
        {/* Linked accounts (SPEC N-13): Discord today, others come with their connection. */}
        <section className={`${cardClass} lg:col-start-2 lg:row-span-5 lg:row-start-1`}>
          <h2 className="type-label text-muted-foreground">Verknüpfte Konten</h2>
          <h3 className="-mb-1 text-[14px] font-medium">Discord</h3>
          {account.hasDiscord ? (
            <>
              <div className="flex items-center gap-3.5">
                <UserAvatar
                  user={{ id: user.id, name: account.name, avatarVersion: account.avatarVersion }}
                  className="size-12 text-[14px]"
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-label font-semibold">{account.name}</span>
                  <span className="text-[13px] text-muted-foreground">Mit Discord verknüpft</span>
                </div>
              </div>
              {user.hubJoinFailedAt || user.dmFailedAt ? (
                <>
                  <DiscordDmWarning hubJoinFailed={user.hubJoinFailedAt !== null} />
                  {account.banned ? null : (
                    // Linking again brings fresh tokens and with them another hub join (§5.8).
                    <DiscordButton
                      mode="link"
                      variant="outline"
                      callbackURL="/account"
                      errorCallbackURL="/account"
                    >
                      Discord erneut verbinden
                    </DiscordButton>
                  )}
                </>
              ) : (
                <span className="flex items-center gap-2 text-[14px] text-success">
                  <CheckIcon strokeWidth={3} />
                  Discord-Nachrichten kommen an
                </span>
              )}
            </>
          ) : (
            <p className="text-[14px] text-muted-foreground">
              Noch nicht verknüpft. Das geht im{" "}
              <Link
                href={setupUrl("/team")}
                className="text-foreground underline underline-offset-2"
              >
                nächsten Schritt der Einrichtung
              </Link>
              .
            </p>
          )}
        </section>
        {account.firstName && !account.banned ? (
          <section className={`${cardClass} lg:col-start-1`}>
            <h2 className="type-label text-muted-foreground">Name und Anmeldung</h2>
            {account.canEditName ? (
              <ActionForm
                action={updateRealNameAction}
                submitLabel="Name speichern"
                variant="outline"
                size="sm"
                className="flex max-w-xl flex-col gap-3"
              >
                <RealNameFields
                  defaults={{ firstName: account.firstName, lastName: account.lastName ?? "" }}
                />
                <p className="text-[13px] text-muted-foreground">
                  Wie auf deiner Immatrikulationsbescheinigung. Nach dem Hochladen kannst du ihn
                  nicht mehr selbst ändern. Nur du und unsere Prüfer sehen ihn.
                </p>
              </ActionForm>
            ) : (
              <p className="text-[14px]">
                <span className="font-semibold">
                  {account.firstName} {account.lastName}
                </span>
                <span className="block text-[13px] text-muted-foreground">
                  Nur du und unsere Prüfer sehen deinen Namen. Ändern geht nach dem Hochladen der
                  Bescheinigung nur per Mail an uns (Adresse im Impressum).
                </span>
              </p>
            )}
            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <p className="text-[14px]">
                E-Mail-Adresse: <span className="font-semibold break-all">{account.email}</span>
              </p>
              <ActionForm
                action={changeEmailAction}
                submitLabel="Adresse ändern"
                variant="outline"
                size="sm"
                className="flex max-w-xl flex-col gap-3"
              >
                <EmailField label="Neue E-Mail-Adresse" name="newEmail" />
                <p className="text-[13px] text-muted-foreground">
                  Wir schicken einen Link an die neue Adresse. Bis du ihn öffnest, gilt die alte.
                </p>
              </ActionForm>
            </div>
            {account.hasPassword ? (
              <div className="flex flex-col gap-3 border-t border-border pt-4">
                <ActionForm
                  action={changePasswordAction}
                  submitLabel="Passwort ändern"
                  variant="outline"
                  size="sm"
                  className="flex max-w-xl flex-col gap-3"
                >
                  <PasswordField
                    label="Aktuelles Passwort"
                    name="currentPassword"
                    autoComplete="current-password"
                  />
                  <PasswordField
                    label="Neues Passwort"
                    name="newPassword"
                    autoComplete="new-password"
                  />
                  <p className="text-[13px] text-muted-foreground">
                    Auf deinen anderen Geräten wirst du danach abgemeldet.
                  </p>
                </ActionForm>
              </div>
            ) : null}
          </section>
        ) : null}
        {/* Data export (SPEC N-5): a plain link, the route answers with a file. */}
        <section className={`${cardClass} lg:col-start-1`}>
          <h2 className="type-label text-muted-foreground">Deine Daten</h2>
          <p className="text-[14px] text-pretty text-muted-foreground">
            Lade alles herunter, was wir zu deinem Konto speichern, als JSON-Datei (Auskunft nach
            Art. 15 DSGVO). Wozu wir die Daten nutzen und wie lange wir sie aufbewahren, steht in
            der{" "}
            <Link href="/datenschutz" className="font-semibold underline underline-offset-2">
              Datenschutzerklärung
            </Link>
            .
          </p>
          <a
            href="/api/account/export"
            download
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "self-start",
            })}
          >
            Meine Daten herunterladen
          </a>
        </section>
        <section className="flex flex-col gap-2.5 pt-2 lg:col-start-1">
          <h2 className="type-h2">Konto löschen</h2>
          <p className="text-[14px] text-pretty text-muted-foreground">
            Löscht dein Konto mit deinen persönlichen Daten und deiner Verifizierung. Das lässt sich
            nicht rückgängig machen.
          </p>
          {account.deletionProblem ? (
            <Alert>
              <span>
                {account.deletionProblem}{" "}
                {account.captainCandidates.length === 0 ? (
                  <Link href="/team" className="font-semibold underline underline-offset-2">
                    Zum Team
                  </Link>
                ) : null}
              </span>
            </Alert>
          ) : null}
          {account.captainCandidates.length > 0 ? (
            // The team page needs a complete account; the role can move from here (SPEC N-3).
            <ActionForm
              action={handOverCaptainAction}
              submitLabel="Captain-Rolle übertragen"
              variant="outline"
              size="sm"
              className="flex flex-col gap-3"
              confirmText="Captain-Rolle wirklich übertragen?"
            >
              <Select
                name="memberId"
                required
                defaultValue={null}
                placeholder="Neuen Captain wählen …"
                aria-label="Neuer Captain"
                options={account.captainCandidates.map((member) => ({
                  value: member.id,
                  label: member.name,
                }))}
              />
            </ActionForm>
          ) : null}
          {account.deletionProblem ? null : (
            <div className="mt-1.5 flex flex-wrap gap-2.5">
              <DeleteAccountDialog consequences={consequences} />
            </div>
          )}
        </section>
      </div>
    </PageMain>
  );
}
