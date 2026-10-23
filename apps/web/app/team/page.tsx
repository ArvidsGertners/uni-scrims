import {
  MAX_TEAM_MEMBERS,
  MEMBER_ROLE_LABELS,
  RANK_LABELS,
  READY_MEMBER_COUNT,
  getMyTeam,
} from "@uni-scrims/core";
import type { MemberRole } from "@uni-scrims/db";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { PageMain } from "@/components/page-main";
import { TeamAvatar } from "@/components/team-avatar";
import { TeamFields } from "@/components/team-fields";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { initials } from "@/lib/format";
import { formatUniversities } from "@/lib/scrim-format";
import { requirePageUser } from "@/lib/session";
import {
  createTeamAction,
  leaveTeamAction,
  regenerateInviteAction,
  removeMemberAction,
  setMemberRoleAction,
  transferCaptainAction,
  updateTeamAction,
} from "./actions";
import { CopyLink } from "./copy-link";
import { JoinLinkForm } from "./join-link-form";
import { MemberRoleSelect } from "./member-role-select";

const cardClass = "flex flex-col rounded-lg border border-border bg-card p-5";
const memberActionClass = "min-h-10 px-2.5 text-[14px]";
const ROLE_OPTIONS = (Object.keys(MEMBER_ROLE_LABELS) as MemberRole[]).map((role) => ({
  value: role,
  label: MEMBER_ROLE_LABELS[role],
}));

export default async function TeamPage() {
  const user = await requirePageUser("/team");
  const team = await getMyTeam(user.id);
  const baseUrl = process.env.BETTER_AUTH_URL ?? "";

  if (!team) {
    return (
      <PageMain className="gap-7">
        <div className="flex flex-col gap-2.5">
          <h1 className="type-h1">Du bist noch in keinem Team</h1>
          <p className="text-pretty text-muted-foreground">
            Gründe ein Team oder tritt über einen Einladungslink bei. Ein Team braucht mindestens{" "}
            {READY_MEMBER_COUNT} verifizierte Spieler und hat höchstens {MAX_TEAM_MEMBERS}{" "}
            Mitglieder. Das geht auch, während deine Verifizierung noch läuft.
          </p>
        </div>
        <section className={`${cardClass} gap-[18px]`}>
          <h2 className="type-h2">Team gründen</h2>
          <ActionForm
            action={createTeamAction}
            submitLabel="Team gründen"
            size="lg"
            submitClassName="w-full"
            className="flex flex-col gap-[18px]"
          >
            <TeamFields />
          </ActionForm>
        </section>
        <div className="flex items-center gap-3 text-[13px] text-faint">
          <span className="h-px flex-1 bg-border" />
          oder
          <span className="h-px flex-1 bg-border" />
        </div>
        <section className={`${cardClass} gap-3.5`}>
          <h2 className="type-h2">Team beitreten</h2>
          <p className="text-[14px] text-pretty text-muted-foreground">
            Frag deinen Captain nach dem Einladungslink und öffne ihn. Oder füge ihn hier ein:
          </p>
          <JoinLinkForm placeholder={`${baseUrl.replace(/^https?:\/\//, "")}/join/…`} />
        </section>
      </PageMain>
    );
  }

  const memberCount = team.members.length;
  const missing = Math.max(0, READY_MEMBER_COUNT - team.verifiedCount);
  const inviteUrl = team.inviteCode ? `${baseUrl}/join/${team.inviteCode}` : null;
  const soleMember = memberCount === 1;
  const manage = team.isCaptain && !team.banned;
  const me = team.members.find((member) => member.id === user.id);

  return (
    <PageMain className="gap-8">
      <div className="flex items-center gap-4">
        <TeamAvatar tag={team.tag} size="lg" own />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="type-h1">{team.name}</h1>
          <span className="text-[14px] text-muted-foreground">
            {formatUniversities(team.universities)} · Teamrang {RANK_LABELS[team.rank]}
          </span>
        </div>
      </div>

      {team.banned ? (
        <Alert>
          <span>
            {team.isCaptain && !soleMember
              ? "Dieses Team ist gesperrt. Die anderen Mitglieder können es verlassen und ein neues gründen oder einem anderen beitreten. Danach kannst du es als letztes Mitglied auflösen."
              : "Dieses Team ist gesperrt. Du kannst es verlassen und ein neues gründen oder einem anderen beitreten."}
          </span>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-display text-[28px] leading-none whitespace-nowrap [font-weight:var(--display-weight)]">
            {memberCount}
            <span className="text-[18px] text-faint"> / {MAX_TEAM_MEMBERS} Mitglieder</span>
          </span>
          <span className="text-right text-[13px] text-muted-foreground">
            {!team.ready
              ? `Noch ${missing} verifizierte bis zum Minimum`
              : memberCount >= MAX_TEAM_MEMBERS
                ? "Kader voll"
                : `Platz für ${MAX_TEAM_MEMBERS - memberCount} weitere`}
          </span>
        </div>
        <div aria-hidden className="relative h-2 overflow-hidden rounded-pill bg-secondary">
          <div
            className={`absolute inset-y-0 left-0 rounded-pill ${team.ready ? "bg-primary" : "bg-warning"}`}
            style={{ width: `${(memberCount / MAX_TEAM_MEMBERS) * 100}%` }}
          />
          <div
            className="absolute inset-y-0 w-0.5 bg-background"
            style={{ left: `${(READY_MEMBER_COUNT / MAX_TEAM_MEMBERS) * 100}%` }}
          />
        </div>
        {!team.ready ? (
          <Alert>
            <span>
              Ihr braucht mindestens {READY_MEMBER_COUNT} verifizierte Spieler, um Scrims anzufragen
              oder euch zu bewerben. Es fehlen noch {missing}. Ersatzspieler zählen mit, Coaches
              nicht.
            </span>
          </Alert>
        ) : null}
      </div>

      {manage ? (
        <section className={`${cardClass} gap-3`}>
          <h2 className="type-h2">Spieler einladen</h2>
          <p className="text-[14px] text-pretty text-muted-foreground">
            Teile den Link in eurem Team-Discord. Erneuerst du ihn, funktioniert der alte nicht
            mehr.
          </p>
          {inviteUrl ? <CopyLink url={inviteUrl} /> : null}
          <ActionForm
            action={regenerateInviteAction}
            submitLabel="Link erneuern"
            variant="link"
            size="bare"
            submitClassName="min-h-10"
            confirmText="Neuen Link erzeugen? Der alte funktioniert dann nicht mehr."
          >
            <input type="hidden" name="teamId" value={team.id} />
          </ActionForm>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="mb-1 type-label text-muted-foreground">Kader</h2>
        <ul className="flex flex-col gap-2">
          {team.members.map((member) => (
            <li
              key={member.id}
              className="flex min-h-[60px] flex-wrap items-center gap-3 border-b border-border py-2"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary font-label text-[12px] font-bold text-muted-foreground">
                {initials(member.name)}
              </span>
              <div className="flex min-w-36 flex-1 flex-wrap items-center gap-2">
                <span className="font-label text-[14px] font-semibold">{member.name}</span>
                {member.isCaptain ? (
                  <Badge variant="accent" className="h-[22px] px-2 text-[12px]">
                    Captain
                  </Badge>
                ) : null}
                {!manage && member.role !== "PLAYER" ? (
                  <Badge className="h-[22px] px-2 text-[12px]">
                    {MEMBER_ROLE_LABELS[member.role]}
                  </Badge>
                ) : null}
                {member.status === "PENDING" ? (
                  <Badge variant="warning" className="h-[22px] px-2 text-[12px]">
                    In Prüfung
                  </Badge>
                ) : member.status === "UNVERIFIED" ? (
                  <Badge className="h-[22px] px-2 text-[12px]">Nicht verifiziert</Badge>
                ) : null}
                {member.id === user.id ? <span className="text-[13px] text-faint">Du</span> : null}
              </div>
              {manage ? (
                <div className="ml-auto flex shrink-0 flex-wrap items-start justify-end gap-1">
                  <MemberRoleSelect
                    key={`${member.id}-${member.role}`}
                    action={setMemberRoleAction}
                    teamId={team.id}
                    memberId={member.id}
                    memberName={member.name}
                    role={member.role}
                    options={ROLE_OPTIONS}
                  />
                  {member.isCaptain ? null : (
                    <>
                      <ActionForm
                        action={transferCaptainAction}
                        submitLabel="Zum Captain"
                        variant="ghost"
                        size="bare"
                        submitClassName={memberActionClass}
                        confirmText={`${member.name} zum Captain machen? Du bist danach normales Mitglied.`}
                      >
                        <input type="hidden" name="teamId" value={team.id} />
                        <input type="hidden" name="memberId" value={member.id} />
                      </ActionForm>
                      <ActionForm
                        action={removeMemberAction}
                        submitLabel="Entfernen"
                        variant="ghost"
                        size="bare"
                        submitClassName={`${memberActionClass} not-disabled:hover:bg-accent-soft not-disabled:hover:text-accent-text`}
                        confirmText={`${member.name} aus dem Team entfernen?`}
                      >
                        <input type="hidden" name="teamId" value={team.id} />
                        <input type="hidden" name="memberId" value={member.id} />
                      </ActionForm>
                    </>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {manage ? (
        <section className={`${cardClass} gap-[18px]`}>
          <h2 className="type-h2">Team bearbeiten</h2>
          <ActionForm
            action={updateTeamAction}
            submitLabel="Speichern"
            size="lg"
            submitClassName="w-full"
            className="flex flex-col gap-[18px]"
          >
            <input type="hidden" name="teamId" value={team.id} />
            <TeamFields defaults={{ name: team.name, tag: team.tag, rank: team.rank }} />
          </ActionForm>
        </section>
      ) : null}

      {team.isCaptain && !soleMember ? (
        <p className="text-[14px] text-pretty text-muted-foreground">
          Als Captain kannst du das Team erst verlassen, wenn du die Captain-Rolle übertragen hast.
        </p>
      ) : (
        <ActionForm
          action={leaveTeamAction}
          submitLabel={team.isCaptain ? "Team auflösen und verlassen" : "Team verlassen"}
          variant="destructive"
          size="sm"
          submitClassName="border-border-strong"
          confirmText={
            team.isCaptain
              ? "Du bist das einzige Mitglied. Das Team wird aufgelöst. Fortfahren?"
              : "Team wirklich verlassen?"
          }
        />
      )}

      {me && me.status !== "VERIFIED" ? (
        <p className="text-[14px] text-muted-foreground">
          Noch nicht verifiziert?{" "}
          <Link href="/verify" className="text-foreground underline underline-offset-2">
            Zur Verifizierung
          </Link>
        </p>
      ) : null}
    </PageMain>
  );
}
