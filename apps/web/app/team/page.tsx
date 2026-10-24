import {
  GAME_LABELS,
  LOGO_BACKGROUNDS,
  LOGO_BACKGROUND_LABELS,
  MAX_TEAM_MEMBERS,
  RANK_LABELS,
  READY_MEMBER_COUNT,
  describeStartDay,
  describeStartTime,
  getTeamDashboard,
} from "@uni-scrims/core";
import { cn } from "cn";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { CopyValue } from "@/components/copy-value";
import { PageMain } from "@/components/page-main";
import { StatTile } from "@/components/stat-tile";
import { TeamLogoPreview } from "@/components/team-avatar";
import { TeamFields } from "@/components/team-fields";
import { Alert } from "@/components/ui/alert";
import { formatFormat, formatReliabilityDetails, formatUniversities } from "@/lib/scrim-format";
import { requirePageUser } from "@/lib/session";
import {
  createTeamAction,
  leaveTeamAction,
  regenerateInviteAction,
  removeTeamLogoAction,
  updateTeamAction,
} from "./actions";
import { JoinLinkForm } from "./join-link-form";
import { TeamLogoForm } from "./team-logo-form";
import { TeamHeader } from "./team-tabs";

const cardClass = "flex flex-col rounded-lg border border-border bg-card p-5";

export default async function TeamPage() {
  const user = await requirePageUser("/team");
  const team = await getTeamDashboard({ userId: user.id, now: new Date() });
  const baseUrl = process.env.BETTER_AUTH_URL ?? "";

  if (!team) {
    return (
      <PageMain width="wide" className="gap-7">
        <div className="flex flex-col gap-2.5">
          <h1 className="type-h1">Du bist noch in keinem Team</h1>
          <p className="max-w-3xl text-pretty text-muted-foreground">
            Gründe ein Team oder tritt über einen Einladungslink bei. Ein Team braucht mindestens{" "}
            {READY_MEMBER_COUNT} verifizierte Spieler und hat höchstens {MAX_TEAM_MEMBERS}{" "}
            Mitglieder. Das geht auch, während deine Verifizierung noch läuft.
          </p>
        </div>
        {/* From 1024 px both ways side by side (SPEC N-12); below in this order. */}
        <div className="contents lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
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
          <div className="flex items-center gap-3 text-[13px] text-faint lg:hidden">
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
        </div>
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
    <PageMain width="wide" className="gap-8">
      <TeamHeader team={team} current="/team" />

      {/* The team at a glance (SPEC N-10): instead of the member bar. */}
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            href="/team/members"
            label="Mitglieder"
            value={`${memberCount} / ${MAX_TEAM_MEMBERS}`}
          >
            {memberCount >= MAX_TEAM_MEMBERS
              ? "Kader voll"
              : `Platz für ${MAX_TEAM_MEMBERS - memberCount} weitere`}
          </StatTile>
          <StatTile
            label="Verifiziert"
            value={`${team.verifiedPlayerCount} / ${READY_MEMBER_COUNT}`}
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

      {/* The team and its logos left, the links right: for the captain from 768 px, for the
          others from 1024 px (SPEC N-12, N-15); on phones in this order. */}
      <div
        className={cn(
          "flex flex-col gap-8",
          manage
            ? "md:grid md:grid-cols-[minmax(0,1fr)_300px] md:items-start md:gap-6 xl:grid-cols-[minmax(0,1fr)_400px]"
            : "lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_400px]",
        )}
      >
        <div className="flex min-w-0 flex-col gap-8 md:gap-6">
          <section className={`${cardClass} gap-[18px]`}>
            <h2 className="type-h2 break-words">Team {team.name}</h2>
            {manage ? (
              <ActionForm
                action={updateTeamAction}
                submitLabel="Speichern"
                className="flex flex-col gap-[18px]"
              >
                <input type="hidden" name="teamId" value={team.id} />
                <TeamFields defaults={{ name: team.name, tag: team.tag, rank: team.rank }} />
              </ActionForm>
            ) : null}
            <dl className="flex flex-col border-t border-border text-[14px]">
              {[
                ...(manage
                  ? []
                  : [
                      { label: "Name", value: team.name },
                      { label: "Kürzel", value: team.tag },
                      { label: "Team-Rang", value: RANK_LABELS[team.rank] },
                    ]),
                { label: "Spiel", value: GAME_LABELS[team.game] ?? team.game },
                { label: "Hochschulen", value: formatUniversities(team.universities) },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex justify-between gap-3 border-b border-border py-3 last:border-b-0"
                >
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="min-w-0 text-right break-words">{row.value}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <span className="text-[14px] font-medium">Team-ID</span>
              <CopyValue value={team.id} />
              <p className="text-[13px] text-muted-foreground">
                Nenn sie uns, wenn du dich für euer Team beim Support meldest.
              </p>
            </div>
          </section>

          {manage ? (
            <section className={`${cardClass} gap-4`}>
              <div className="flex flex-col gap-1">
                <h2 className="type-h2">Logos</h2>
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
            </section>
          ) : null}
        </div>

        {manage ? (
          <div className="flex min-w-0 flex-col gap-8 md:gap-6">
            <section className={`${cardClass} gap-3`}>
              <h2 className="type-h2">Interne Links</h2>
              <span className="text-[14px] font-medium">Einladungslink</span>
              <p className="text-[14px] text-pretty text-muted-foreground">
                Teile ihn in eurem Team-Discord. Erneuerst du ihn, funktioniert der alte nicht mehr.
              </p>
              {inviteUrl ? (
                <CopyValue value={inviteUrl} display={inviteUrl.replace(/^https?:\/\//, "")} />
              ) : null}
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
          </div>
        ) : null}
      </div>

      <section className="flex flex-col gap-4 border-t border-border pt-6">
        {team.isCaptain && !soleMember ? (
          <p className="text-[14px] text-pretty text-muted-foreground">
            Als Captain kannst du das Team erst verlassen, wenn du die Captain-Rolle übertragen hast
            (im Tab{" "}
            <Link href="/team/members" className="text-foreground underline underline-offset-2">
              Mitglieder
            </Link>
            ).
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
      </section>
    </PageMain>
  );
}
