import {
  GAME_LABELS,
  TEAM_LINK_TEXTS,
  TEAM_LINK_MAX,
  TEAM_LINK_PLATFORMS,
  LOGO_BACKGROUNDS,
  LOGO_BACKGROUND_LABELS,
  MAX_TEAM_MEMBERS,
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
import { RankLabel } from "@/components/rank-icon";
import { StatTile } from "@/components/stat-tile";
import { TeamLogoPreview } from "@/components/team-avatar";
import { TeamFields } from "@/components/team-fields";
import { EXTERNAL_LINK_PROPS, TeamLinkIcon } from "@/components/team-links";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { formatFormat, formatReliabilityDetails, formatUniversities } from "@/lib/scrim-format";
import { requirePageUser } from "@/lib/session";
import {
  leaveTeamAction,
  regenerateInviteAction,
  removeTeamLogoAction,
  updateTeamAction,
  updateTeamLinksAction,
} from "./actions";
import { NewTeamForms } from "./new-team-forms";
import { TeamLogoForm } from "./team-logo-form";
import { TeamHeader } from "./team-tabs";
import { getLocale, getMessages } from "@/lib/locale";
import { teamPageMessages } from "@/i18n/team";

const cardClass = "flex flex-col rounded-lg border border-border bg-card p-5";

export default async function TeamPage() {
  const user = await requirePageUser("/team");
  const team = await getTeamDashboard({ userId: user.id, now: new Date() });
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
            {t.noTeamIntro(READY_MEMBER_COUNT, MAX_TEAM_MEMBERS)}
          </p>
        </div>
        <NewTeamForms />
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
            label={t.members}
            value={`${memberCount} / ${MAX_TEAM_MEMBERS}`}
          >
            {memberCount >= MAX_TEAM_MEMBERS
              ? t.rosterFull
              : t.roomFor(MAX_TEAM_MEMBERS - memberCount)}
          </StatTile>
          <StatTile
            label={t.verified}
            value={`${team.verifiedPlayerCount} / ${READY_MEMBER_COUNT}`}
            tone={team.ready ? "text-success" : "text-warning"}
          >
            {team.ready
              ? t.readyToPlay(READY_MEMBER_COUNT)
              : t.missingToReady(missing, READY_MEMBER_COUNT)}
          </StatTile>
          <StatTile label={t.played} value={team.reliability.played}>
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
        {!team.ready ? (
          <Alert>
            <span>{t.notReadyNotice(READY_MEMBER_COUNT, missing)}</span>
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
            <h2 className="type-h2 break-words">{t.teamHeading(team.name)}</h2>
            {manage ? (
              <ActionForm
                action={updateTeamAction}
                submitLabel={t.save}
                className="flex flex-col gap-[18px]"
              >
                <input type="hidden" name="teamId" value={team.id} />
                <TeamFields defaults={{ name: team.name, tag: team.tag }} />
              </ActionForm>
            ) : null}
            <dl className="flex flex-col border-t border-border text-[14px]">
              {[
                ...(manage
                  ? []
                  : [
                      { label: t.name, value: team.name },
                      { label: t.tag, value: team.tag },
                    ]),
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

          {manage ? (
            <section className={`${cardClass} gap-4`}>
              <div className="flex flex-col gap-1">
                <h2 className="type-h2">{t.logos}</h2>
                <p className="text-[13px] text-pretty text-muted-foreground">{t.logosHint}</p>
              </div>
              {LOGO_BACKGROUNDS.map((background) => {
                const hasLogo = team.logo?.backgrounds.includes(background) ?? false;
                return (
                  <div key={background} className="flex items-start gap-4">
                    <TeamLogoPreview team={team} background={background} />
                    <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                      <span className="text-[14px] font-medium">
                        {LOGO_BACKGROUND_LABELS[locale][background]}
                      </span>
                      <TeamLogoForm teamId={team.id} background={background} hasLogo={hasLogo} />
                      {hasLogo ? (
                        <ActionForm
                          action={removeTeamLogoAction}
                          submitLabel={t.removeLogo}
                          variant="ghost"
                          size="sm"
                          className="flex flex-col"
                          submitClassName="-ml-4"
                          confirmText={t.removeLogoConfirm[background]}
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

        <div className="flex min-w-0 flex-col gap-8 md:gap-6">
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
                  ? t.externalLinksHint.captain
                  : team.banned
                    ? t.externalLinksHint.banned
                    : t.externalLinksHint.member}
              </p>
            </div>
            {manage ? (
              <ActionForm
                // Mounted anew once the stored links change, so the fields show the saved
                // (normalized) addresses rather than what was typed.
                key={team.links.map((link) => link.url).join(" ")}
                action={updateTeamLinksAction}
                submitLabel={t.saveLinks}
                className="flex flex-col gap-4"
              >
                <input type="hidden" name="teamId" value={team.id} />
                {TEAM_LINK_PLATFORMS.map((platform) => (
                  <Field
                    key={platform.key}
                    label={
                      <span className="flex items-center gap-2">
                        <TeamLinkIcon platform={platform.key} />
                        {platforms[platform.key].label}
                      </span>
                    }
                  >
                    <Input
                      name={platform.key}
                      defaultValue={
                        team.links.find((link) => link.platform === platform.key)?.url ?? ""
                      }
                      placeholder={platforms[platform.key].placeholder}
                      maxLength={TEAM_LINK_MAX}
                      inputMode="url"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </Field>
                ))}
              </ActionForm>
            ) : team.links.length === 0 ? (
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
            {t.notVerified}{" "}
            <Link href="/verify" className="text-foreground underline underline-offset-2">
              {t.toVerification}
            </Link>
          </p>
        ) : null}
      </section>
    </PageMain>
  );
}
