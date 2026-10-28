import {
  RANK_LABELS,
  RANKS,
  formatDayHeading,
  type getPublicBoard,
  toBerlinDateString,
} from "@uni-scrims/core";
import type { Locale } from "@uni-scrims/core/config/locale";
import type { Rank } from "@uni-scrims/db";
import Link from "next/link";
import { CheckboxFilters } from "@/components/filter-checkbox";
import { FilterForm, FilterSubmit } from "@/components/filter-form";
import { LeagueFilter } from "@/components/league-filter";
import { ListGroup } from "@/components/list-group";
import { OplLogo } from "@/components/opl-logo";
import { RankFilter } from "@/components/rank-filter";
import { RankIcon } from "@/components/rank-icon";
import { type CardReadyWindow, ReadyWindowCard } from "@/components/ready-window-card";
import { type CardRequest, RequestCard } from "@/components/request-card";
import { buttonVariants } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { getLocale, getMessages } from "@/lib/locale";
import { list } from "@/lib/search-params";
import { leagueMessages } from "@/i18n/format";
import { readyWindowMessages, scrimSharedMessages, scrimsPageMessages } from "@/i18n/scrims";

// Filters and cards of the board, signed in on /scrims and without login on /board (§5.26).

/** The applied filters, as getBoard and getPublicBoard return them. */
export type BoardFilter = Awaited<ReturnType<typeof getPublicBoard>>["filter"];

/** The `?rang=` values for getBoard/getPublicBoard: "ALL" if sent, else the known ranks. */
export function readBoardRanks(value: string | string[] | undefined): Rank[] | "ALL" {
  const values = list(value);
  return values.includes("ALL")
    ? "ALL"
    : values.filter((rank): rank is Rank => RANKS.includes(rank as Rank));
}

/** The `?liga=` values for getBoard, getPublicBoard and getTeamList (SPEC N-36); core drops
 * leagues the current season doesn't have. */
export function readLeagues(value: string | string[] | undefined): number[] {
  return list(value)
    .filter((entry) => /^\d{1,2}$/.test(entry))
    .map(Number)
    .filter((division) => division >= 1);
}

/** The options of the league filter (SPEC N-36), with the OPL mark; empty without a season. */
export async function leagueFilterOptions(leagues: number[]) {
  const t = await getMessages(leagueMessages);
  return leagues.map((division) => ({
    value: String(division),
    label: t.division(division),
    icon: <OplLogo alt="" className="h-3.5" />,
  }));
}

/** Whether a filter is applied, for the empty states. */
export function isBoardFiltered(filter: BoardFilter): boolean {
  return (
    filter.date !== null ||
    filter.ranks.length > 0 ||
    filter.fullyVerifiedOnly ||
    filter.reliableOnly ||
    filter.leagues.length > 0
  );
}

/** Requests by Berlin calendar day of their start; the list is sorted by start already. */
function groupByDay<T extends { startsAt: Date }>(requests: T[], locale: Locale) {
  const groups: { day: string; title: string; requests: T[] }[] = [];
  for (const request of requests) {
    const day = toBerlinDateString(request.startsAt);
    const last = groups.at(-1);
    if (last?.day === day) last.requests.push(request);
    else
      groups.push({ day, title: formatDayHeading(request.startsAt, locale), requests: [request] });
  }
  return groups;
}

/**
 * The GET filter form of SPEC P0-4 for the page at `action`; `ownRank` marks the own team's rank
 * in the rank filter. The league filter (SPEC N-36) only while a season is known.
 */
export async function BoardFilterForm({
  filter,
  leagueOptions,
  action,
  ownRank = null,
}: {
  filter: BoardFilter;
  leagueOptions: number[];
  action: string;
  ownRank?: Rank | null;
}) {
  const t = await getMessages(scrimsPageMessages);
  const shared = await getMessages(scrimSharedMessages);
  const league = await getMessages(leagueMessages);
  const leagues = await leagueFilterOptions(leagueOptions);
  return (
    // Keyed by the applied filter: soft navigations would otherwise keep stale select values.
    <FilterForm
      key={`${filter.date ?? ""}|${filter.ranks.join(",")}|${filter.leagues.join(",")}|${filter.fullyVerifiedOnly}|${filter.reliableOnly}`}
      action={action}
      className={
        leagues.length > 0
          ? "grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto] lg:grid-cols-[minmax(0,16rem)_minmax(0,16rem)_minmax(0,14rem)_auto_auto] lg:justify-start"
          : "grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_1fr_auto_auto] lg:grid-cols-[minmax(0,18rem)_minmax(0,18rem)_auto_auto] lg:justify-start"
      }
    >
      <Field label={shared.date}>
        <DatePicker name="datum" defaultValue={filter.date} placeholder={t.allDays} clearable />
      </Field>
      <Field label={t.rankInRange}>
        <RankFilter
          defaultValue={filter.ranks}
          options={RANKS.map((value) => ({
            value,
            label: RANK_LABELS[value],
            icon: <RankIcon rank={value} />,
            hint: value === ownRank ? t.ownRank : undefined,
          }))}
        />
      </Field>
      {leagues.length > 0 ? (
        <Field label={league.filter} className="col-span-2 sm:col-span-1">
          <LeagueFilter defaultValue={filter.leagues.map(String)} options={leagues} />
        </Field>
      ) : null}
      {/* Below the row from 640 px, between the fields and the buttons on phones. */}
      <CheckboxFilters
        fullyVerifiedOnly={filter.fullyVerifiedOnly}
        reliableOnly={filter.reliableOnly}
        className="col-span-full sm:order-last"
      />
      <FilterSubmit>{t.filter}</FilterSubmit>
      <Link href={action} className={buttonVariants({ variant: "ghost", className: "px-2.5" })}>
        {t.reset}
      </Link>
    </FilterForm>
  );
}

/**
 * The request cards, one group per day with its count; `columns` instead of CARD_COLUMNS, e.g. on
 * the narrow public board.
 */
export async function BoardRequestList({
  requests,
  columns,
}: {
  requests: (CardRequest & { id: string })[];
  columns?: string;
}) {
  const locale = await getLocale();
  const t = await getMessages(scrimsPageMessages);
  return (
    <>
      {groupByDay(requests, locale).map((group) => (
        <ListGroup
          key={group.day}
          title={group.title}
          count={t.requestCount(group.requests.length)}
          className={columns}
        >
          {group.requests.map((request) => (
            <RequestCard key={request.id} request={request} />
          ))}
        </ListGroup>
      ))}
    </>
  );
}

/**
 * The section "Heute spielbereit" above the requests (SPEC N-27); nothing without windows.
 * `actingTeamId` is the team the board was shown for (§5.20), null without one; signed out, the
 * cards lead to the login.
 */
export async function ReadyWindowList({
  windows,
  actingTeamId,
  signedIn,
  columns,
}: {
  windows: CardReadyWindow[];
  actingTeamId: string | null;
  signedIn: boolean;
  columns?: string;
}) {
  if (windows.length === 0) return null;
  const t = await getMessages(readyWindowMessages);
  return (
    <ListGroup title={t.sectionTitle} count={t.windowCount(windows.length)} className={columns}>
      {windows.map((window) => (
        <ReadyWindowCard
          key={window.id}
          window={window}
          actingTeamId={actingTeamId}
          signedIn={signedIn}
        />
      ))}
    </ListGroup>
  );
}
