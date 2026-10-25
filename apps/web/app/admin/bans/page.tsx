import {
  LOGO_BACKGROUNDS,
  MIN_SEARCH_LENGTH,
  TEAM_LINK_TEXTS,
  searchModerationTargets,
  userDisplayName,
} from "@uni-scrims/core";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { LIST_COLUMNS } from "@/components/list-group";
import { TeamAvatar, TeamLogoPreview } from "@/components/team-avatar";
import { EXTERNAL_LINK_PROPS, TeamLinkIcon } from "@/components/team-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireAdminShellPage } from "@/lib/session";
import { AdminShell } from "../admin-shell";
import {
  banTeamAction,
  banUserAction,
  removeTeamLinksAction,
  removeTeamLogoAction,
} from "../actions";
import { adminHref } from "@/lib/admin-url";
import { getLocale, getMessages } from "@/lib/locale";
import { adminBansMessages, adminSearchMessages } from "@/i18n/admin";

type BansMessages = (typeof adminBansMessages)["de"];

export default async function BansPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { staff: admin, overview } = await requireAdminShellPage("/bans", "admin");
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const result = await searchModerationTargets({ adminId: admin.id, query });
  const tooShort = query.length > 0 && query.length < MIN_SEARCH_LENGTH;
  const searched = query.length >= MIN_SEARCH_LENGTH;
  const platforms = await getMessages(TEAM_LINK_TEXTS);
  const locale = await getLocale();
  const t = await getMessages(adminBansMessages);
  const search = await getMessages(adminSearchMessages);

  return (
    <AdminShell overview={overview} current="/bans">
      <h1 className="type-h1">{t.title}</h1>
      <div className="flex max-w-3xl flex-col gap-1 text-[14px] text-muted-foreground">
        <p>{t.banUserHint}</p>
        <p>{t.banTeamHint}</p>
        <p>{t.unbanHint}</p>
      </div>

      <form key={query} method="get" className="flex max-w-3xl flex-wrap items-end gap-3">
        <div className="flex min-w-60 flex-1 flex-col gap-1.5">
          <Label htmlFor="q">{t.searchLabel}</Label>
          <Input id="q" name="q" defaultValue={query} />
        </div>
        <Button type="submit" variant="outline">
          {search.search}
        </Button>
        <Link href={adminHref("/bans")} className="text-[14px] underline underline-offset-2">
          {search.reset}
        </Link>
      </form>
      {tooShort ? <p className="text-[14px]">{search.tooShort(MIN_SEARCH_LENGTH)}</p> : null}

      {searched ? (
        <section className="flex flex-col gap-3">
          <h2 className="type-h2">{t.users}</h2>
          {result.users.length === 0 ? <p className="text-[14px]">{t.noResults}</p> : null}
          <div className={`${LIST_COLUMNS} gap-3`}>
            {result.users.map((user) => {
              const name = userDisplayName(user.name, locale);
              return (
                <div
                  key={user.id}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-[14px]"
                >
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{name}</span>
                    <span className="text-muted-foreground">{t.discordId(user.discordId)}</span>
                    {user.banned ? <Badge variant="accent">{t.banned}</Badge> : null}
                  </p>
                  {user.teams.map((team) => (
                    <p key={team.id}>
                      {team.isCaptain ? t.captainOf(team.name) : t.memberOf(team.name)}
                    </p>
                  ))}
                  {user.banned ? null : (
                    <ActionForm
                      action={banUserAction}
                      submitLabel={t.banUser}
                      variant="destructive"
                      confirmText={banUserConfirmText(t, name, user.teams)}
                    >
                      <input type="hidden" name="userId" value={user.id} />
                    </ActionForm>
                  )}
                </div>
              );
            })}
          </div>

          <h2 className="type-h2">{t.teams}</h2>
          {result.teams.length === 0 ? <p className="text-[14px]">{t.noResults}</p> : null}
          <div className={`${LIST_COLUMNS} gap-3`}>
            {result.teams.map((team) => (
              <div
                key={team.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-[14px]"
              >
                <div className="flex items-center gap-3">
                  <TeamAvatar team={team} size="sm" />
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{team.name}</span>
                      <span className="text-muted-foreground">[{team.tag}]</span>
                      {team.banned ? <Badge variant="accent">{t.banned}</Badge> : null}
                    </p>
                    <p>
                      {t.captain(userDisplayName(team.captainName, locale))} ·{" "}
                      {t.members(team.memberCount)}
                    </p>
                  </div>
                </div>
                {team.logo === null ? null : (
                  // Both logos, each on its background, so neither goes unseen.
                  <div className="flex gap-2.5">
                    {LOGO_BACKGROUNDS.map((background) => (
                      <TeamLogoPreview
                        key={background}
                        team={team}
                        background={background}
                        emptyLabel={t.noLogo}
                        className="size-12"
                      />
                    ))}
                  </div>
                )}
                {team.links.length === 0 ? null : (
                  // As addresses, so the admin sees where each one leads (SPEC N-15).
                  <ul className="flex flex-col gap-1.5">
                    {team.links.map((link) => (
                      <li key={link.platform} className="flex min-w-0 items-center gap-2">
                        <TeamLinkIcon platform={link.platform} />
                        <span className="sr-only">{platforms[link.platform].label}:</span>
                        <a
                          href={link.url}
                          {...EXTERNAL_LINK_PROPS}
                          className="min-w-0 break-all text-muted-foreground underline underline-offset-2 hover:text-foreground"
                        >
                          {link.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2.5">
                  {team.banned ? null : (
                    <ActionForm
                      action={banTeamAction}
                      submitLabel={t.banTeam}
                      variant="destructive"
                      confirmText={t.banTeamConfirm(team.name)}
                    >
                      <input type="hidden" name="teamId" value={team.id} />
                    </ActionForm>
                  )}
                  {team.logo === null ? null : (
                    // Logos are not checked before they show (SPEC §9); admins take bad ones down.
                    <ActionForm
                      action={removeTeamLogoAction}
                      submitLabel={t.removeLogo}
                      variant="outline"
                      confirmText={
                        team.logo.backgrounds.length > 1
                          ? t.removeBothLogosConfirm(team.name)
                          : t.removeLogoConfirm(team.name)
                      }
                      confirmDestructive
                    >
                      <input type="hidden" name="teamId" value={team.id} />
                      {/* Only the logos shown here, not one uploaded since (SPEC N-6). */}
                      <input type="hidden" name="logoVersion" value={team.logo.version} />
                    </ActionForm>
                  )}
                  {team.linksVersion === null ? null : (
                    // Links are not checked beyond their platform (SPEC §9); admins take bad ones down.
                    <ActionForm
                      action={removeTeamLinksAction}
                      submitLabel={t.removeLinks}
                      variant="outline"
                      confirmText={t.removeLinksConfirm(team.name)}
                      confirmDestructive
                    >
                      <input type="hidden" name="teamId" value={team.id} />
                      {/* Only the links shown here, not ones saved since. */}
                      <input type="hidden" name="linksVersion" value={team.linksVersion} />
                    </ActionForm>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </AdminShell>
  );
}

/** What a user ban does to each of the user's teams (SPEC N-17). */
function banUserConfirmText(
  t: BansMessages,
  name: string,
  teams: { name: string; isCaptain: boolean }[],
): string {
  const names = (list: { name: string }[]) => list.map((team) => team.name).join(", ");
  const captainOf = teams.filter((team) => team.isCaptain);
  const memberOf = teams.filter((team) => !team.isCaptain);
  const parts = [t.banUserConfirm(name)];
  if (memberOf.length > 0) parts.push(t.banUserRemoved(names(memberOf)));
  if (captainOf.length > 0) parts.push(t.banUserCaptain(captainOf.length, names(captainOf)));
  return parts.join(" ");
}
