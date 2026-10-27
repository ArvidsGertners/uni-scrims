import { RANKS, RANK_LABELS, THEME_LABELS, getAccount, userDisplayName } from "@uni-scrims/core";
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
import { DialogShell } from "@/components/dialog-shell";
import { DETAIL_COLUMNS } from "@/components/page-main";
import { RankIcon } from "@/components/rank-icon";
import { UserAvatar } from "@/components/user-avatar";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { switchTeamAction } from "../team/actions";
import { AccountTabs } from "./account-tabs";
import { DeleteAccountDialog } from "./delete-account-dialog";
import { ThemeForm } from "./theme-form";
import { getLocale, getMessages, getText } from "@/lib/locale";
import type { Locale } from "@uni-scrims/core/config/locale";
import { accountPageMessages } from "@/i18n/account";

const cardClass = "flex flex-col gap-4 rounded-lg border border-border bg-card p-5";

function themeOptions(locale: Locale) {
  return Object.values(ThemePreference).map((value) => ({
    value,
    label: THEME_LABELS[locale][value],
  }));
}

/** The select needs a value for "none"; the action sends it to core as empty. */
const NO_RANK = "NONE";
function rankOptions(noRank: string) {
  return [
    { value: NO_RANK, label: noRank, icon: <RankIcon rank={null} /> },
    ...RANKS.map((rank) => ({
      value: rank,
      label: RANK_LABELS[rank],
      icon: <RankIcon rank={rank} />,
    })),
  ];
}

// The verification belongs to Konto (SPEC N-9): status here, the upload on /verify. The texts are
// in the dictionary.
const VERIFICATION_STYLES = {
  VERIFIED: { className: "text-success", primary: false },
  PENDING: { className: "text-warning", primary: false },
  REJECTED: { className: "text-destructive-text", primary: true },
  NONE: { className: "text-warning", primary: true },
} as const;

/**
 * Konto-Einstellungen (SPEC N-13), as a dialog over the current page (SPEC N-31): over the board for
 * active accounts when loaded directly, over the landing page for banned and incomplete ones.
 */
export async function AccountDialog({
  intercepted,
  params,
}: {
  intercepted: boolean;
  params: Record<string, string | string[] | undefined>;
}) {
  // Better Auth sends errors of the mail and Discord links back as ?error=… (§5.8).
  const { email: emailConfirmed, error } = params;
  const user = await requirePageAccountUser("/account");
  const account = await getAccount(user.id);
  const text = await getText();
  const locale = await getLocale();
  const t = await getMessages(accountPageMessages);
  const verification = {
    ...VERIFICATION_STYLES[account.verification.status],
    ...t.verification[account.verification.status],
  };
  // The placeholder of a new account is stored in German (§5.21).
  const name = userDisplayName(account.name, locale);

  const consequences = [
    t.consequences.deleted,
    account.banned ? t.consequences.discordIdKept : t.consequences.discordUnlinked,
    // Every own team (SPEC N-17): a captain's team is dissolved, the others are left.
    ...account.teams.map((team) =>
      team.isCaptain ? t.consequences.teamDissolved(team.name) : t.consequences.teamLeft(team.name),
    ),
    t.consequences.pastScrims,
    t.consequences.hubServer,
  ];

  const active = !account.banned && !account.setupStep;

  return (
    // Logging out is in the account menu since Phase 17 (SPEC N-13).
    <DialogShell
      title={t.title}
      size="wide"
      fallback={active ? "/scrims" : "/"}
      intercepted={intercepted}
    >
      {active ? (
        <AccountTabs current="/account" unverified={account.verificationNeeded} inDialog />
      ) : null}
      {account.banned ? (
        <Alert>
          <span>{t.bannedNotice}</span>
        </Alert>
      ) : account.setupStep ? (
        <Alert>
          <span>
            {t.setupIncomplete((label) => (
              <Link href={setupUrl("/team")} className="font-semibold underline underline-offset-2">
                {label}
              </Link>
            ))}
          </span>
        </Alert>
      ) : null}
      {typeof error === "string" ? (
        <Alert>
          <span>
            {error.includes("already_linked") || error.includes("unable_to_link")
              ? t.discordLinkFailed
              : t.linkInvalid}
          </span>
        </Alert>
      ) : emailConfirmed === "bestaetigt" ? (
        <Alert variant="success">
          <span>{t.emailConfirmed}</span>
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
          <h2 className="type-label text-muted-foreground">{t.basics}</h2>
          <div className="flex max-w-xl flex-col gap-2">
            <span className="text-[14px] font-medium">{t.profileId}</span>
            <CopyValue value={user.id} />
            <p className="text-[13px] text-muted-foreground">{t.profileIdHint}</p>
          </div>
          <div className="flex max-w-xl flex-col gap-2 border-t border-border pt-4">
            <span className="text-[14px] font-medium">{t.theme}</span>
            <ThemeForm current={user.theme} options={themeOptions(locale)} />
            <p className="text-[13px] text-muted-foreground">{t.themeHint}</p>
          </div>
          {/* Only active, complete accounts set a rank: it only counts in a team (SPEC N-16). */}
          {account.banned || account.setupStep ? null : (
            <div className="flex max-w-xl flex-col gap-2 border-t border-border pt-4">
              <ActionForm
                action={setPlayerRankAction}
                submitLabel={t.saveRank}
                variant="outline"
                size="sm"
                className="flex flex-col gap-3"
              >
                <Field label={t.yourRank}>
                  <Select
                    name="rank"
                    defaultValue={account.rank ?? NO_RANK}
                    options={rankOptions(t.noRank)}
                  />
                </Field>
              </ActionForm>
              <p className="text-[13px] text-pretty text-muted-foreground">{t.rankHint}</p>
            </div>
          )}
        </section>
        <DetailRows
          className="px-5 pt-4 pb-1 lg:col-start-1"
          rows={[
            {
              label: t.status,
              value: (
                <span className={`font-semibold ${verification.className}`}>
                  {verification.label}
                </span>
              ),
            },
            { label: t.university, value: account.verification.university ?? "–" },
            {
              label: t.teams(account.teams.length),
              value:
                account.teams.length > 0 ? (
                  <span className="flex flex-col items-end gap-0.5">
                    {account.teams.map((team) => (
                      <span key={team.id}>
                        {team.name}
                        {team.isCaptain ? t.captainSuffix : ""}
                      </span>
                    ))}
                  </span>
                ) : (
                  t.noTeam
                ),
            },
          ]}
        >
          <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <h2 className="type-label text-muted-foreground">{t.studentStatus}</h2>
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
          <h2 className="type-label text-muted-foreground">{t.linkedAccounts}</h2>
          <h3 className="-mb-1 text-[14px] font-medium">{t.discord}</h3>
          {account.hasDiscord ? (
            <>
              <div className="flex items-center gap-3.5">
                <UserAvatar
                  user={{ id: user.id, name, avatarVersion: account.avatarVersion }}
                  className="size-12 text-[14px]"
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-label font-semibold">{name}</span>
                  <span className="text-[13px] text-muted-foreground">{t.linkedWithDiscord}</span>
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
                      {t.relinkDiscord}
                    </DiscordButton>
                  )}
                </>
              ) : (
                <span className="flex items-center gap-2 text-[14px] text-success">
                  <CheckIcon strokeWidth={3} />
                  {t.discordMessagesArrive}
                </span>
              )}
            </>
          ) : (
            <p className="text-[14px] text-muted-foreground">
              {t.discordNotLinked((label) => (
                <Link
                  href={setupUrl("/team")}
                  className="text-foreground underline underline-offset-2"
                >
                  {label}
                </Link>
              ))}
            </p>
          )}
        </section>
        {account.firstName && !account.banned ? (
          <section className={`${cardClass} lg:col-start-1`}>
            <h2 className="type-label text-muted-foreground">{t.nameAndSignIn}</h2>
            {account.canEditName ? (
              <ActionForm
                action={updateRealNameAction}
                submitLabel={t.saveName}
                variant="outline"
                size="sm"
                className="flex max-w-xl flex-col gap-3"
              >
                <RealNameFields
                  defaults={{ firstName: account.firstName, lastName: account.lastName ?? "" }}
                />
                <p className="text-[13px] text-muted-foreground">{t.nameHint}</p>
              </ActionForm>
            ) : (
              <p className="text-[14px]">
                <span className="font-semibold">
                  {account.firstName} {account.lastName}
                </span>
                <span className="block text-[13px] text-muted-foreground">{t.nameLockedHint}</span>
              </p>
            )}
            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <p className="text-[14px]">
                {t.emailAddress} <span className="font-semibold break-all">{account.email}</span>
              </p>
              <ActionForm
                action={changeEmailAction}
                submitLabel={t.changeEmail}
                variant="outline"
                size="sm"
                className="flex max-w-xl flex-col gap-3"
              >
                <EmailField label={t.newEmail} name="newEmail" />
                <p className="text-[13px] text-muted-foreground">{t.newEmailHint}</p>
              </ActionForm>
            </div>
            {account.hasPassword ? (
              <div className="flex flex-col gap-3 border-t border-border pt-4">
                <ActionForm
                  action={changePasswordAction}
                  submitLabel={t.changePassword}
                  variant="outline"
                  size="sm"
                  className="flex max-w-xl flex-col gap-3"
                >
                  <PasswordField
                    label={t.currentPassword}
                    name="currentPassword"
                    autoComplete="current-password"
                  />
                  <PasswordField
                    label={t.newPassword}
                    name="newPassword"
                    autoComplete="new-password"
                  />
                  <p className="text-[13px] text-muted-foreground">{t.passwordHint}</p>
                </ActionForm>
              </div>
            ) : null}
          </section>
        ) : null}
        {/* Data export (SPEC N-5): a plain link, the route answers with a file. */}
        <section className={`${cardClass} lg:col-start-1`}>
          <h2 className="type-label text-muted-foreground">{t.yourData}</h2>
          <p className="text-[14px] text-pretty text-muted-foreground">
            {t.yourDataText((label) => (
              <Link href="/datenschutz" className="font-semibold underline underline-offset-2">
                {label}
              </Link>
            ))}
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
            {t.downloadData}
          </a>
        </section>
        <section className="flex flex-col gap-2.5 pt-2 lg:col-start-1">
          <h2 className="type-h2">{t.deleteAccount}</h2>
          <p className="text-[14px] text-pretty text-muted-foreground">{t.deleteAccountText}</p>
          {account.deletionProblem ? (
            <Alert>
              <div className="flex flex-col gap-3">
                {/* Which teams, as there may be several since Phase 21 (SPEC N-17). */}
                <span>
                  {text(account.deletionProblem)}{" "}
                  {t.affectedTeams(
                    account.teams
                      .filter((team) => team.blocksDeletion)
                      .map((team) => team.name)
                      .join(", "),
                  )}
                </span>
                {/* The role moves on the team page of each such team (Mitglieder). */}
                {account.captainHandovers.length === 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {account.teams
                      .filter((team) => team.blocksDeletion)
                      .map((team) => (
                        <form key={team.id} action={switchTeamAction.bind(null, team.id, null)}>
                          <Button
                            type="submit"
                            variant="outline"
                            size="sm"
                            className="h-auto max-w-full py-2 text-left whitespace-normal"
                          >
                            {t.toTeam(team.name)}
                          </Button>
                        </form>
                      ))}
                  </div>
                ) : null}
              </div>
            </Alert>
          ) : null}
          {account.captainHandovers.map((handover) => (
            // The team page needs a complete account; the role can move from here (SPEC N-3).
            <ActionForm
              key={handover.teamId}
              action={handOverCaptainAction}
              submitLabel={t.handOverCaptain}
              variant="outline"
              size="sm"
              className="flex flex-col gap-3"
              confirmText={t.handOverConfirm(handover.teamName)}
            >
              <input type="hidden" name="teamId" value={handover.teamId} />
              <Field label={t.newCaptainFor(handover.teamName)}>
                <Select
                  name="memberId"
                  required
                  defaultValue={null}
                  placeholder={t.chooseNewCaptain}
                  options={handover.candidates.map((member) => ({
                    value: member.id,
                    label: member.name,
                  }))}
                />
              </Field>
            </ActionForm>
          ))}
          {account.deletionProblem ? null : (
            <div className="mt-1.5 flex flex-wrap gap-2.5">
              <DeleteAccountDialog consequences={consequences} />
            </div>
          )}
        </section>
      </div>
    </DialogShell>
  );
}
