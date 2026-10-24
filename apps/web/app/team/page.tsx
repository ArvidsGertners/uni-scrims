import {
  LOGO_BACKGROUNDS,
  LOGO_BACKGROUND_LABELS,
  MAX_TEAM_MEMBERS,
  MEMBER_ROLES,
  MEMBER_ROLE_LABELS,
  RANK_LABELS,
  READY_MEMBER_COUNT,
  describeStartDay,
  describeStartTime,
  getTeamDashboard,
} from "@uni-scrims/core";
import { cn } from "cn";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { PageMain } from "@/components/page-main";
import { StatTile } from "@/components/stat-tile";
import { TeamAvatar, TeamLogoPreview } from "@/components/team-avatar";
import { TeamFields } from "@/components/team-fields";
import { UserAvatar } from "@/components/user-avatar";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { formatFormat, formatReliabilityDetails, formatUniversities } from "@/lib/scrim-format";
import { requirePageUser } from "@/lib/session";
import {
  createTeamAction,
  leaveTeamAction,
  regenerateInviteAction,
  removeMemberAction,
  removeTeamLogoAction,
  setMemberRoleAction,
  transferCaptainAction,
  updateTeamAction,
} from "./actions";
import { CopyLink } from "./copy-link";
import { JoinLinkForm } from "./join-link-form";
import { MemberRoleSelect } from "./member-role-select";
import { TeamLogoForm } from "./team-logo-form";

const cardClass = "flex flex-col rounded-lg border border-border bg-card p-5";
const memberActionClass = "min-h-10 px-2.5 text-[14px]";
const ROLE_OPTIONS = MEMBER_ROLES.map((role) => ({
  value: role,
  label: MEMBER_ROLE_LABELS[role],
}));

export default async function TeamPage() {
  const user = await requirePageUser("/team");
  const team = await getTeamDashboard({ userId: user.id, now: new Date() });
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
  const missing = Math.max(0, READY_MEMBER_COUNT - team.verifiedPlayerCount);
  const inviteUrl = team.inviteCode ? `${baseUrl}/join/${team.inviteCode}` : null;
  const soleMember = memberCount === 1;
  const manage = team.isCaptain && !team.banned;
  const me = team.members.find((member) => member.id === user.id);

  return (
    <PageMain className="gap-8">
      <div className="flex items-center gap-4">
        <TeamAvatar team={team} size="lg" own />
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

      {/* The team at a glance (SPEC N-10): instead of the member bar. */}
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Mitglieder" value={`${memberCount} / ${MAX_TEAM_MEMBERS}`}>
            {memberCount >= MAX_TEAM_MEMBERS
              ? "Kader voll"
              : `Platz für ${MAX_TEAM_MEMBERS - memberCount} weitere`}
          </StatTile>
          <StatTile
            label="Verifiziert"
            value={team.verifiedPlayerCount}
            tone={team.ready ? "text-success" : "text-warning"}
          >
            {team.ready
              ? `Spielbereit (mindestens ${READY_MEMBER_COUNT})`
              : `Noch ${missing} bis ${READY_MEMBER_COUNT}`}
          </StatTile>
          <StatTile label="Gespielt" value={team.reliability.played}>
            {formatReliabilityDetails(team.reliability)}
          </StatTile>
          {team.nextScrim ? (
            <StatTile
              href={`/scrims/${team.nextScrim.id}`}
              label="Nächstes Scrim"
              value={describeStartDay(team.nextScrim.startsAt)}
              valueClassName="text-[28px]"
            >
              {describeStartTime(team.nextScrim.startsAt)} · gegen {team.nextScrim.opponent.name} ·{" "}
              {formatFormat(team.nextScrim.format)}
            </StatTile>
          ) : (
            <StatTile href="/scrims" label="Nächstes Scrim" value="–" valueClassName="text-faint">
              Noch keins geplant. Zum Board
            </StatTile>
          )}
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

      {/* From 768 px: squad left, the captain's cards right; on phones in this order. */}
      <div
        className={cn(
          "flex flex-col gap-8",
          manage &&
            "md:grid md:grid-cols-[minmax(0,1fr)_300px] md:grid-rows-[auto_auto_1fr] md:items-start md:gap-x-6 md:gap-y-6",
        )}
      >
        {manage ? (
          <section className={`${cardClass} gap-3 md:col-start-2 md:row-start-1`}>
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

        <section className="flex flex-col gap-2 md:col-start-1 md:row-span-3 md:row-start-1">
          <h2 className="mb-1 type-label text-muted-foreground">Kader</h2>
          <ul className="flex flex-col gap-2">
            {team.members.map((member) => (
              <li
                key={member.id}
                className="flex min-h-[60px] flex-wrap items-center gap-3 border-b border-border py-2"
              >
                <UserAvatar user={member} className="size-10 text-[12px] text-muted-foreground" />
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
                  {/* Coaches need no verification (SPEC N-1); a coach as captain still does. */}
                  {member.role === "COACH" && !member.isCaptain ? null : member.status ===
                    "PENDING" ? (
                    <Badge variant="warning" className="h-[22px] px-2 text-[12px]">
                      In Prüfung
                    </Badge>
                  ) : member.status === "UNVERIFIED" ? (
                    <Badge className="h-[22px] px-2 text-[12px]">Nicht verifiziert</Badge>
                  ) : null}
                  {member.id === user.id ? (
                    <span className="text-[13px] text-faint">Du</span>
                  ) : null}
                </div>
                {manage ? (
                  <div className="ml-auto flex max-w-full flex-wrap items-start justify-end gap-1">
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
          <section className={`${cardClass} gap-[18px] md:col-start-2`}>
            <h2 className="type-h2">Team bearbeiten</h2>
            <div className="flex flex-col gap-4 border-b border-border pb-[18px]">
              <div className="flex flex-col gap-1">
                <span className="text-[14px] font-medium">Logos</span>
                <p className="text-[13px] text-pretty text-muted-foreground">
                  PNG oder WebP mit durchsichtigem Hintergrund, max. 2 MB. Durchsichtige Ränder
                  schneiden wir ab, damit das Logo die Fläche füllt. Die Seite zeigt das Logo, das
                  zum hellen oder dunklen Modus passt; fehlt eins, steht das andere auf einem
                  passenden Kästchen.
                </p>
              </div>
              {LOGO_BACKGROUNDS.map((background) => {
                const hasLogo = team.logo?.backgrounds.includes(background) ?? false;
                return (
                  <div key={background} className="flex items-start gap-4">
                    <TeamLogoPreview team={team} background={background} />
                    <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                      <span className="text-[14px] font-medium">
                        {LOGO_BACKGROUND_LABELS[background]}
                      </span>
                      <TeamLogoForm teamId={team.id} background={background} hasLogo={hasLogo} />
                      {hasLogo ? (
                        <ActionForm
                          action={removeTeamLogoAction}
                          submitLabel="Entfernen"
                          variant="ghost"
                          size="sm"
                          className="flex flex-col"
                          submitClassName="-ml-4"
                          confirmText={`${LOGO_BACKGROUND_LABELS[background]} wirklich entfernen?`}
                        >
                          <input type="hidden" name="teamId" value={team.id} />
                          <input type="hidden" name="background" value={background} />
                        </ActionForm>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
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

        <div className="flex flex-col gap-4 md:col-start-2">
          {team.isCaptain && !soleMember ? (
            <p className="text-[14px] text-pretty text-muted-foreground">
              Als Captain kannst du das Team erst verlassen, wenn du die Captain-Rolle übertragen
              hast.
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

          {me && me.status !== "VERIFIED" && (me.role !== "COACH" || me.isCaptain) ? (
            <p className="text-[14px] text-muted-foreground">
              Noch nicht verifiziert?{" "}
              <Link href="/verify" className="text-foreground underline underline-offset-2">
                Zur Verifizierung
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </PageMain>
  );
}
