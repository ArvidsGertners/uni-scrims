import {
  MEMBER_ROLE_LABELS,
  RANK_LABELS,
  RANKS,
  TEAM_SEARCH_MAX,
  type TeamListEntry,
  getTeamList,
  userDisplayName,
} from "@uni-scrims/core";
import type { Rank } from "@uni-scrims/db";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { FullyVerifiedBadge } from "@/components/fully-verified-badge";
import { CheckboxFilters, readCheckboxFilters } from "@/components/filter-checkbox";
import { FilterForm, FilterSubmit } from "@/components/filter-form";
import { UsersIcon } from "@/components/icons";
import { Masonry } from "@/components/masonry";
import { PageMain } from "@/components/page-main";
import { RankFilter } from "@/components/rank-filter";
import { RankIcon, RankLabel } from "@/components/rank-icon";
import { ReliabilityLine } from "@/components/reliability-line";
import { TeamAvatar } from "@/components/team-avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { list, single } from "@/lib/search-params";
import { requirePageUser } from "@/lib/session";
import { formatUniversities } from "@/lib/scrim-format";
import { getLocale, getMessages } from "@/lib/locale";
import { teamsPageMessages } from "@/i18n/teams";

/** All active teams their captain has not hidden, with their members (SPEC N-20, §5.23). */
export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser("/teams");
  const params = await searchParams;
  const t = await getMessages(teamsPageMessages);
  const { teams, filter } = await getTeamList({
    userId: user.id,
    search: single(params.suche) ?? null,
    ranks: list(params.rang).filter((value): value is Rank => RANKS.includes(value as Rank)),
    ...readCheckboxFilters(params),
    now: new Date(),
  });
  const filtered =
    filter.search !== "" ||
    filter.ranks.length > 0 ||
    filter.fullyVerifiedOnly ||
    filter.reliableOnly;

  return (
    <PageMain width="wide" className="gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
        <h1 className="type-h1">{t.title}</h1>
        <span className="type-label font-normal text-faint">{t.teamCount(teams.length)}</span>
      </div>

      {/* Keyed by the applied filter: soft navigations would otherwise keep stale values. */}
      <FilterForm
        key={`${filter.search}|${filter.ranks.join(",")}|${filter.fullyVerifiedOnly}|${filter.reliableOnly}`}
        action="/teams"
        className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_1fr_auto_auto] lg:grid-cols-[minmax(0,22rem)_minmax(0,18rem)_auto_auto] lg:justify-start"
      >
        <Field label={t.search} className="max-sm:col-span-2">
          <Input
            type="search"
            name="suche"
            defaultValue={filter.search}
            placeholder={t.searchPlaceholder}
            maxLength={TEAM_SEARCH_MAX}
          />
        </Field>
        <Field label={t.teamRank} className="max-sm:col-span-2">
          <RankFilter
            defaultValue={filter.ranks}
            options={RANKS.map((value) => ({
              value,
              label: RANK_LABELS[value],
              icon: <RankIcon rank={value} />,
            }))}
          />
        </Field>
        {/* Below the row from 640 px, between the fields and the buttons on phones. */}
        <CheckboxFilters
          fullyVerifiedOnly={filter.fullyVerifiedOnly}
          reliableOnly={filter.reliableOnly}
          className="col-span-full sm:order-last"
        />
        <FilterSubmit>{t.filter}</FilterSubmit>
        <Link href="/teams" className={buttonVariants({ variant: "ghost", className: "px-2.5" })}>
          {t.reset}
        </Link>
      </FilterForm>

      {teams.length === 0 ? (
        <EmptyState
          icon={<UsersIcon size={26} strokeWidth={1.8} />}
          title={filtered ? t.noMatches : t.noTeams}
        >
          {filtered ? t.noMatchesText : t.noTeamsText}
        </EmptyState>
      ) : (
        <Masonry>
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} />
          ))}
        </Masonry>
      )}
    </PageMain>
  );
}

async function TeamCard({ team }: { team: TeamListEntry }) {
  const locale = await getLocale();
  const t = await getMessages(teamsPageMessages);
  return (
    <article className="flex flex-col gap-4 rounded-lg border border-border bg-card p-[18px]">
      <div className="flex items-center gap-3">
        <TeamAvatar team={team} className="border-border" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="min-w-0 text-[16px] font-semibold break-words">
              {team.name} <span className="font-label text-[13px] text-faint">{team.tag}</span>
            </h2>
            {team.fullyVerified ? <FullyVerifiedBadge /> : null}
          </div>
          <span className="text-[13px] text-pretty text-muted-foreground">
            {formatUniversities(team.universities, locale)}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="text-[13px] text-muted-foreground">
          {t.teamRank} <RankLabel rank={team.rank} />
        </p>
        <ReliabilityLine reliability={team.reliability} />
      </div>
      {/* A direct request to this team, for the captain (SPEC N-26). */}
      {team.canRequest ? (
        <Link
          href={`/requests/new?team=${encodeURIComponent(team.id)}`}
          className={buttonVariants({ variant: "outline", size: "sm", className: "self-start" })}
        >
          {t.directRequest}
        </Link>
      ) : null}
      <section className="flex flex-col gap-1 border-t border-border pt-3.5">
        <h3 className="type-label text-muted-foreground">
          {t.members} · {team.members.length}
        </h3>
        <ul className="flex flex-col">
          {team.members.map((member) => (
            <li
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 border-b border-border py-2 text-[14px] last:border-b-0"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="font-label font-semibold break-all">
                  {userDisplayName(member.name, locale)}
                </span>
                {member.isCaptain ? (
                  <Badge variant="accent" className="h-[22px] px-2 text-[12px]">
                    {t.captain}
                  </Badge>
                ) : null}
              </span>
              <span className="flex items-center gap-3 text-muted-foreground">
                <span>{MEMBER_ROLE_LABELS[locale][member.role]}</span>
                <span className="text-foreground">
                  <RankLabel rank={member.rank} />
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
