import {
  GAME_LABELS,
  TEAM_LINK_TEXTS,
  FULLY_VERIFIED_PLAYER_COUNT,
  MAX_TEAM_MEMBERS,
  RELIABILITY_WINDOW_DAYS,
  describeStartDay,
  describeStartTime,
  formatBerlinDate,
  getTeamDashboard,
  requireUser,
} from "@uni-scrims/core";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { CopyValue } from "@/components/copy-value";
import { PageMain } from "@/components/page-main";
import { RankLabel } from "@/components/rank-icon";
import { StatTile } from "@/components/stat-tile";
import { OplLogo } from "@/components/opl-logo";
import { EXTERNAL_LINK_PROPS, TeamLinkIcon } from "@/components/team-links";
import { formatFormat, formatReliabilityDetails, formatUniversities } from "@/lib/scrim-format";
import { leaveTeamAction, regenerateInviteAction } from "./actions";
import { landingStatus } from "./landing-status";
import { NewTeamForms } from "./new-team-forms";
import { TeamHeader } from "./team-tabs";
import { getLocale, getMessages } from "@/lib/locale";
import { teamPageMessages } from "@/i18n/team";

const cardClass = "flex flex-col rounded-lg border border-border bg-card p-5";

/**
 * The page /team, also behind the team settings dialog (SPEC N-31). Since Phase 35 the captain edits
 * the team there; the invite link stays here (§5.33).
 */
export async function TeamView({ userId }: { userId: string }) {
  const team = await getTeamDashboard({ userId, now: new Date() });
  const baseUrl = process.env.BETTER_AUTH_URL ?? "";
  const platforms = await getMessages(TEAM_LINK_TEXTS);
  const locale = await getLocale();
  const t = await getMessages(teamPageMessages);

  if (!team) {
    return (
      <PageMain width="wide" className="gap-7">
        <div className="flex flex-col gap-2.5">
          <h1 className="type-h1">{t.noTeamHeading}</h1>
          <p className="max-w-3xl text-pretty text-muted-foreground">
            {t.noTeamIntro(FULLY_VERIFIED_PLAYER_COUNT, MAX_TEAM_MEMBERS)}
          </p>
        </div>
        <NewTeamForms oplLinked={(await requireUser(userId)).oplUserId !== null} />
      </PageMain>
    );
  }

  const memberCount = team.members.length;
  const missing = Math.max(0, FULLY_VERIFIED_PLAYER_COUNT - team.verifiedPlayerCount);
  const inviteUrl = team.inviteCode ? `${baseUrl}/join/${team.inviteCode}` : null;
  const soleMember = memberCount === 1;
  const manage = team.isCaptain && !team.banned;
  const me = team.members.find((member) => member.id === userId);

  return (
    <PageMain width="wide" className="gap-8">
      <TeamHeader team={team} current="/team" />

      {/* The team at a glance (SPEC N-10): instead of the member bar. */}
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            href="/team/members"
            label={t.members}
            value={`${memberCount} / ${MAX_TEAM_MEMBERS}`}
          >
            {memberCount >= MAX_TEAM_MEMBERS
              ? t.rosterFull
              : t.roomFor(MAX_TEAM_MEMBERS - memberCount)}
          </StatTile>
          {/* The badge, no longer a condition for scrims (SPEC N-21). */}
          <StatTile
            label={t.verified}
            value={`${team.verifiedPlayerCount} / ${FULLY_VERIFIED_PLAYER_COUNT}`}
            tone={team.fullyVerified ? "text-success" : undefined}
          >
            {team.fullyVerified ? t.fullyVerified : t.missingToBadge(missing)}
          </StatTile>
          <StatTile label={t.played(RELIABILITY_WINDOW_DAYS)} value={team.reliability.played}>
            {formatReliabilityDetails(team.reliability, locale)}
          </StatTile>
          {team.nextScrim ? (
            <StatTile
              href={`/scrims/${team.nextScrim.id}`}
              label={t.nextScrim}
              value={describeStartDay(team.nextScrim.startsAt, locale)}
              valueClassName="text-[28px]"
            >
              {t.nextScrimDetails(
                describeStartTime(team.nextScrim.startsAt, locale),
                team.nextScrim.opponent.name,
                formatFormat(team.nextScrim.format, locale),
              )}
            </StatTile>
          ) : (
            <StatTile href="/scrims" label={t.nextScrim} value="–" valueClassName="text-faint">
              {t.noNextScrim}
            </StatTile>
          )}
        </div>
      </div>

      {/* The team left, the invite link and the external links right from 1024 px (SPEC N-12,
          N-15); on phones in this order. */}
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className={`${cardClass} min-w-0 gap-[18px]`}>
          <h2 className="type-h2 break-words">{t.teamHeading(team.name)}</h2>
          <dl className="flex flex-col border-t border-border text-[14px]">
            {[
              { label: t.name, value: team.name },
              { label: t.tag, value: team.tag },
              {
                // Computed from the players' and substitutes' own ranks (SPEC N-16).
                label: t.teamRank,
                value: (
                  <span className="flex flex-col items-end gap-0.5">
                    <span>
                      <RankLabel rank={team.rank} />
                      {team.rankedCount > 0 ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · {t.rankedFrom(team.rankedCount)}
                        </span>
                      ) : null}
                    </span>
                    {me && me.countsForTeamRank && me.rank === null ? (
                      <Link
                        href="/account"
                        className="text-[13px] text-foreground underline underline-offset-2"
                      >
                        {t.addRank}
                      </Link>
                    ) : null}
                  </span>
                ),
              },
              { label: t.game, value: GAME_LABELS[team.game] ?? team.game },
              { label: t.universities, value: formatUniversities(team.universities, locale) },
              // Whether all signed-in users see the team and its members there (SPEC N-20).
              { label: t.teamsList, value: team.listed ? t.listed : t.unlisted },
              // Whether the captain allowed the landing page and whether it is possible (SPEC N-34).
              { label: t.landing, value: landingStatus(team, t) },
              // Who may apply to the team's requests (SPEC N-21).
              {
                label: t.applicants,
                value: team.verifiedApplicantsOnly ? t.applicantsVerifiedOnly : t.applicantsAll,
              },
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
            <span className="text-[14px] font-medium">{t.teamId}</span>
            <CopyValue value={team.id} />
            <p className="text-[13px] text-muted-foreground">{t.teamIdHint}</p>
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-8 lg:gap-6">
          {/* Stays here rather than in the settings: copying it is everyday work (SPEC N-31). */}
          {manage ? (
            <section className={`${cardClass} gap-3`}>
              <h2 className="type-h2">{t.internalLinks}</h2>
              <span className="text-[14px] font-medium">{t.inviteLink}</span>
              <p className="text-[14px] text-pretty text-muted-foreground">{t.inviteLinkHint}</p>
              {inviteUrl ? (
                <CopyValue value={inviteUrl} display={inviteUrl.replace(/^https?:\/\//, "")} />
              ) : null}
              <ActionForm
                action={regenerateInviteAction}
                submitLabel={t.renewLink}
                variant="link"
                size="bare"
                submitClassName="min-h-10"
                confirmText={t.renewLinkConfirm}
              >
                <input type="hidden" name="teamId" value={team.id} />
              </ActionForm>
            </section>
          ) : null}

          <section className={`${cardClass} gap-4`}>
            <div className="flex flex-col gap-1">
              <h2 className="type-h2">{t.externalLinks}</h2>
              <p className="text-[13px] text-pretty text-muted-foreground">
                {manage
                  ? t.externalLinksHint.captainView
                  : team.banned
                    ? t.externalLinksHint.banned
                    : t.externalLinksHint.member}
              </p>
            </div>
            {team.links.length === 0 ? (
              <p className="text-[14px] text-muted-foreground">{t.noLinks}</p>
            ) : (
              <ul className="flex flex-col">
                {team.links.map((link) => (
                  <li key={link.platform} className="border-b border-border last:border-b-0">
                    <a
                      href={link.url}
                      {...EXTERNAL_LINK_PROPS}
                      className="flex min-h-11 items-center gap-3 py-2 text-[14px] hover:text-foreground"
                    >
                      <TeamLinkIcon platform={link.platform} />
                      <span className="font-medium">{platforms[link.platform].label}</span>
                      <span className="ml-auto min-w-0 truncate text-muted-foreground">
                        {link.url.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "")}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* OPL (SPEC N-35): the members in the OPL roster by name, the others as a number. */}
          {team.opl ? (
            <section className={`${cardClass} gap-3`}>
              <div className="flex flex-col gap-1">
                <h2 className="type-h2">
                  <OplLogo variant="wordmark" className="h-5" />
                </h2>
                <p className="text-[13px] text-pretty text-muted-foreground">{t.oplCardHint}</p>
              </div>
              <a
                href={team.opl.url}
                {...EXTERNAL_LINK_PROPS}
                className="flex min-h-11 items-center gap-3 border-b border-border py-2 text-[14px] hover:text-foreground"
              >
                <OplLogo alt="" />
                <span className="font-medium">{t.oplTeamOnOpl}</span>
                <span className="ml-auto min-w-0 truncate text-muted-foreground">
                  {team.opl.url.replace(/^https:\/\/(www\.)?/, "")}
                </span>
              </a>
              <div className="flex flex-col gap-1.5">
                <span className="text-[14px] font-medium">{t.oplOnUniScrims}</span>
                {team.opl.matches.length === 0 ? (
                  <p className="text-[14px] text-muted-foreground">{t.oplNoMatches}</p>
                ) : (
                  <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[14px]">
                    {team.opl.matches.map((member) => (
                      <li key={member.id} className="min-w-0 break-words">
                        {member.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {team.opl.others > 0 ? (
                <span className="flex items-center gap-2 text-[14px] text-muted-foreground">
                  <OplLogo alt="" />
                  {t.oplOthers(team.opl.others)}
                </span>
              ) : null}
              <p className="text-[13px] text-faint">
                {t.oplCheckedAt(formatBerlinDate(team.opl.checkedAt, locale))}
              </p>
            </section>
          ) : manage ? (
            <section className={`${cardClass} gap-2`}>
              <h2 className="type-h2">
                <OplLogo variant="wordmark" className="h-5" />
              </h2>
              <p className="text-[14px] text-pretty text-muted-foreground">
                {t.oplNotLinked((label) => (
                  <Link
                    href="/team/settings"
                    className="text-foreground underline underline-offset-2"
                  >
                    {label}
                  </Link>
                ))}
              </p>
            </section>
          ) : null}
        </div>
      </div>

      <section className="flex flex-col gap-4 border-t border-border pt-6">
        {team.isCaptain && !soleMember ? (
          team.banned ? (
            // A banned team cannot hand over the role (SPEC P0-10); the note above says what goes.
            <p className="text-[14px] text-pretty text-muted-foreground">{t.bannedLastMember}</p>
          ) : (
            <p className="text-[14px] text-pretty text-muted-foreground">
              {t.captainLeaveNote((label) => (
                <Link href="/team/members" className="text-foreground underline underline-offset-2">
                  {label}
                </Link>
              ))}
            </p>
          )
        ) : (
          <ActionForm
            action={leaveTeamAction}
            submitLabel={team.isCaptain ? t.dissolveAndLeave : t.leave}
            variant="destructive"
            size="sm"
            submitClassName="border-border-strong"
            confirmText={team.isCaptain ? t.dissolveConfirm : t.leaveConfirm}
          >
            <input type="hidden" name="teamId" value={team.id} />
          </ActionForm>
        )}

        {me && me.status !== "VERIFIED" && me.needsVerification ? (
          <p className="text-[14px] text-muted-foreground">
            {me.isCaptain ? t.notVerified.captain : t.notVerified.player}{" "}
            <Link href="/verify" className="text-foreground underline underline-offset-2">
              {t.toVerification}
            </Link>
          </p>
        ) : null}
      </section>
    </PageMain>
  );
}
