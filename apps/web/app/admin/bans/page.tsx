import { MIN_SEARCH_LENGTH, searchModerationTargets } from "@uni-scrims/core";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireAdminPage } from "@/lib/session";
import { AdminNav } from "../admin-nav";
import { banTeamAction, banUserAction } from "../actions";

// Consequences from SPEC P0-9 and the edge cases.
const TEAM_BAN_CONSEQUENCES =
  "Offene Anfragen werden gelöscht, offene Bewerbungen zurückgezogen und künftige Scrims abgesagt; die Absagen zählen für niemanden als kurzfristig. Die Mitglieder bleiben im Team und können es verlassen.";

export default async function BansPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdminPage("/admin/bans");
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const result = await searchModerationTargets({ adminId: admin.id, query });
  const tooShort = query.length > 0 && query.length < MIN_SEARCH_LENGTH;
  const searched = query.length >= MIN_SEARCH_LENGTH;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <AdminNav adminId={admin.id} />
      <h1 className="text-2xl font-bold">Sperren</h1>
      <div className="flex flex-col gap-1 text-sm opacity-80">
        <p>
          Nutzer sperren: Die Person wird sofort abgemeldet. Spieler werden aus ihrem Team entfernt.
          Ein Captain bleibt im Team, und das Team wird mitgesperrt.
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
        <Link href="/admin/bans" className="text-sm underline">
          Zurücksetzen
        </Link>
      </form>
      {tooShort ? (
        <p className="text-sm">Bitte mindestens {MIN_SEARCH_LENGTH} Zeichen eingeben.</p>
      ) : null}

      {searched ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Nutzer</h2>
          {result.users.length === 0 ? <p className="text-sm">Keine Treffer.</p> : null}
          {result.users.map((user) => (
            <div key={user.id} className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{user.name}</span>
                <span className="opacity-60">Discord-ID {user.discordId}</span>
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

          <h2 className="text-lg font-semibold">Teams</h2>
          {result.teams.length === 0 ? <p className="text-sm">Keine Treffer.</p> : null}
          {result.teams.map((team) => (
            <div key={team.id} className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{team.name}</span>
                <span className="opacity-60">[{team.tag}]</span>
                {team.banned ? <Badge variant="accent">Gesperrt</Badge> : null}
              </p>
              <p>
                Captain: {team.captainName} · {team.memberCount} Mitglieder
              </p>
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
            </div>
          ))}
        </section>
      ) : null}
    </main>
  );
}
