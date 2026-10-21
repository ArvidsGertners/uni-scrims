import { MAX_TEAM_MEMBERS, READY_MEMBER_COUNT, getMyTeam } from "@uni-scrims/core";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { TeamCard } from "@/components/team-card";
import { TeamFields } from "@/components/team-fields";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { requirePageUser } from "@/lib/session";
import {
  createTeamAction,
  leaveTeamAction,
  regenerateInviteAction,
  removeMemberAction,
  transferCaptainAction,
  updateTeamAction,
} from "./actions";

const STATUS_LABELS = {
  VERIFIED: "Verifiziert",
  PENDING: "In Prüfung",
  UNVERIFIED: "Nicht verifiziert",
} as const;

export default async function TeamPage() {
  const user = await requirePageUser("/team");
  const team = await getMyTeam(user.id);

  if (!team) {
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-8">
        <h1 className="text-2xl font-bold">Team anlegen</h1>
        <p className="text-sm">
          Du bist in keinem Team. Lege ein Team an oder lass dir vom Captain einen Einladungslink
          schicken. Das geht auch, während deine Verifizierung noch läuft.
        </p>
        <ActionForm action={createTeamAction} submitLabel="Team anlegen">
          <TeamFields />
        </ActionForm>
      </main>
    );
  }

  const missing = Math.max(0, READY_MEMBER_COUNT - team.verifiedCount);
  const inviteUrl = team.inviteCode
    ? `${process.env.BETTER_AUTH_URL ?? ""}/join/${team.inviteCode}`
    : null;
  const soleMember = team.members.length === 1;

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-bold">Dein Team</h1>
      {team.banned ? (
        <p className="text-destructive">
          Dieses Team ist gesperrt. Du kannst es verlassen und ein neues gründen oder einem anderen
          beitreten.
        </p>
      ) : null}
      <TeamCard
        name={team.name}
        tag={team.tag}
        rank={team.rank}
        universities={team.universities}
        ready={team.ready}
        memberCount={team.members.length}
      />
      {!team.ready ? (
        <p className="text-sm">
          Spielbereit ab {READY_MEMBER_COUNT} verifizierten Mitgliedern. Es fehlen noch {missing}.
          Wer in Prüfung oder nicht verifiziert ist, siehst du unten.
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          Mitglieder ({team.members.length}/{MAX_TEAM_MEMBERS})
        </h2>
        <ul className="flex flex-col gap-3">
          {team.members.map((member) => (
            <li key={member.id} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{member.name}</span>
                {member.isCaptain ? <Badge>Captain</Badge> : null}
                <Badge variant={member.status === "VERIFIED" ? "secondary" : "outline"}>
                  {STATUS_LABELS[member.status]}
                </Badge>
              </div>
              {team.isCaptain && !member.isCaptain && !team.banned ? (
                <div className="flex flex-wrap gap-2">
                  <ActionForm
                    action={transferCaptainAction}
                    submitLabel="Zum Captain machen"
                    variant="outline"
                    confirmText={`${member.name} zum Captain machen? Du bist danach normales Mitglied.`}
                  >
                    <input type="hidden" name="teamId" value={team.id} />
                    <input type="hidden" name="memberId" value={member.id} />
                  </ActionForm>
                  <ActionForm
                    action={removeMemberAction}
                    submitLabel="Entfernen"
                    variant="destructive"
                    confirmText={`${member.name} aus dem Team entfernen?`}
                  >
                    <input type="hidden" name="teamId" value={team.id} />
                    <input type="hidden" name="memberId" value={member.id} />
                  </ActionForm>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {team.isCaptain && !team.banned ? (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Einladungslink</h2>
            {inviteUrl ? <Input readOnly value={inviteUrl} aria-label="Einladungslink" /> : null}
            <p className="text-sm opacity-70">
              Schick den Link deinen Mitspielern. Erneuerst du ihn, funktioniert der alte nicht
              mehr.
            </p>
            <ActionForm
              action={regenerateInviteAction}
              submitLabel="Link erneuern"
              variant="outline"
              confirmText="Neuen Link erzeugen? Der alte funktioniert dann nicht mehr."
            >
              <input type="hidden" name="teamId" value={team.id} />
            </ActionForm>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Team bearbeiten</h2>
            <ActionForm action={updateTeamAction} submitLabel="Speichern">
              <input type="hidden" name="teamId" value={team.id} />
              <TeamFields defaults={{ name: team.name, tag: team.tag, rank: team.rank }} />
            </ActionForm>
          </section>
        </>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Team verlassen</h2>
        {team.isCaptain && !soleMember ? (
          <p className="text-sm">
            Als Captain kannst du das Team erst verlassen, wenn du die Captain-Rolle übertragen
            hast.
          </p>
        ) : (
          <ActionForm
            action={leaveTeamAction}
            submitLabel={team.isCaptain ? "Team auflösen und verlassen" : "Team verlassen"}
            variant="destructive"
            confirmText={
              team.isCaptain
                ? "Du bist das einzige Mitglied. Das Team wird aufgelöst. Fortfahren?"
                : "Team wirklich verlassen?"
            }
          />
        )}
      </section>

      <p className="text-sm opacity-70">
        Noch nicht verifiziert?{" "}
        <Link href="/verify" className="underline">
          Zur Verifizierung
        </Link>
      </p>
    </main>
  );
}
