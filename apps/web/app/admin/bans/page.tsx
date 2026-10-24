import { LOGO_BACKGROUNDS, MIN_SEARCH_LENGTH, searchModerationTargets } from "@uni-scrims/core";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { TeamAvatar, TeamLogoPreview } from "@/components/team-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireStaffPage } from "@/lib/session";
import { AdminNav } from "../admin-nav";
import { banTeamAction, banUserAction, removeTeamLogoAction } from "../actions";
import { PageMain } from "@/components/page-main";

// Consequences from SPEC P0-9 and the edge cases.
const TEAM_BAN_CONSEQUENCES =
  "Offene Anfragen werden gelöscht, offene Bewerbungen zurückgezogen und künftige Scrims abgesagt; die Absagen zählen für niemanden als kurzfristig. Die Mitglieder bleiben im Team und können es verlassen.";

export default async function BansPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireStaffPage("/admin/bans", "admin");
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const result = await searchModerationTargets({ adminId: admin.id, query });
  const tooShort = query.length > 0 && query.length < MIN_SEARCH_LENGTH;
  const searched = query.length >= MIN_SEARCH_LENGTH;

  return (
    <PageMain className="gap-6">
      <AdminNav staff={admin} />
      <h1 className="type-h1">Sperren</h1>
      <div className="flex flex-col gap-1 text-[14px] text-muted-foreground">
        <p>
          Nutzer sperren: Die Person wird sofort abgemeldet. Mitglieder werden aus ihrem Team
          entfernt. Ein Captain bleibt im Team, und das Team wird mitgesperrt.
        </p>
        <p>Team sperren: {TEAM_BAN_CONSEQUENCES}</p>
        <p>Entsperren geht nur per Datenbank (siehe README).</p>
      </div>

      <form key={query} method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-60 flex-1 flex-col gap-1.5">
          <Label htmlFor="q">Discord-Name, Discord-ID oder Teamname</Label>
          <Input id="q" name="q" defaultValue={query} />
        </div>
        <Button type="submit" variant="outline">
          Suchen
        </Button>
        <Link href="/admin/bans" className="text-[14px] underline underline-offset-2">
          Zurücksetzen
        </Link>
      </form>
      {tooShort ? (
        <p className="text-[14px]">Bitte mindestens {MIN_SEARCH_LENGTH} Zeichen eingeben.</p>
      ) : null}

      {searched ? (
        <section className="flex flex-col gap-3">
          <h2 className="type-h2">Nutzer</h2>
          {result.users.length === 0 ? <p className="text-[14px]">Keine Treffer.</p> : null}
          {result.users.map((user) => (
            <div
              key={user.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-[14px]"
            >
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{user.name}</span>
                <span className="text-muted-foreground">Discord-ID {user.discordId}</span>
                {user.banned ? <Badge variant="accent">Gesperrt</Badge> : null}
              </p>
              {user.team ? (
                <p>
                  {user.team.isCaptain ? "Captain" : "Mitglied"} von {user.team.name}
                </p>
              ) : null}
              {user.banned ? null : (
                <ActionForm
                  action={banUserAction}
                  submitLabel="Nutzer sperren"
                  variant="destructive"
                  confirmText={
                    user.team?.isCaptain
                      ? `${user.name} sperren? Als Captain wird auch das Team ${user.team.name} gesperrt: ${TEAM_BAN_CONSEQUENCES}`
                      : user.team
                        ? `${user.name} sperren? Die Person wird abgemeldet und aus ${user.team.name} entfernt.`
                        : `${user.name} sperren? Die Person wird abgemeldet.`
                  }
                >
                  <input type="hidden" name="userId" value={user.id} />
                </ActionForm>
              )}
            </div>
          ))}

          <h2 className="type-h2">Teams</h2>
          {result.teams.length === 0 ? <p className="text-[14px]">Keine Treffer.</p> : null}
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
                    {team.banned ? <Badge variant="accent">Gesperrt</Badge> : null}
                  </p>
                  <p>
                    Captain: {team.captainName} · {team.memberCount} Mitglieder
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
                      className="size-12"
                    />
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2.5">
                {team.banned ? null : (
                  <ActionForm
                    action={banTeamAction}
                    submitLabel="Team sperren"
                    variant="destructive"
                    confirmText={`${team.name} sperren? ${TEAM_BAN_CONSEQUENCES}`}
                  >
                    <input type="hidden" name="teamId" value={team.id} />
                  </ActionForm>
                )}
                {team.logo === null ? null : (
                  // Logos are not checked before they show (SPEC §9); admins take bad ones down.
                  <ActionForm
                    action={removeTeamLogoAction}
                    submitLabel="Logo entfernen"
                    variant="outline"
                    confirmText={
                      team.logo.backgrounds.length > 1
                        ? `Beide Logos von ${team.name} entfernen?`
                        : `Logo von ${team.name} entfernen?`
                    }
                  >
                    <input type="hidden" name="teamId" value={team.id} />
                    {/* Only the logos shown here, not one uploaded since (SPEC N-6). */}
                    <input type="hidden" name="logoVersion" value={team.logo.version} />
                  </ActionForm>
                )}
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </PageMain>
  );
}
