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
import { ListGroup } from "@/components/list-group";
import { RankFilter } from "@/components/rank-filter";
import { RankIcon } from "@/components/rank-icon";
import { type CardReadyWindow, ReadyWindowCard } from "@/components/ready-window-card";
import { type CardRequest, RequestCard } from "@/components/request-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { getLocale, getMessages } from "@/lib/locale";
import { list } from "@/lib/search-params";
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

/** Whether a filter is applied, for the empty states. */
export function isBoardFiltered(filter: BoardFilter): boolean {
  return (
    filter.date !== null ||
    filter.ranks.length > 0 ||
    filter.fullyVerifiedOnly ||
    filter.reliableOnly
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
 * in the rank filter.
 */
export async function BoardFilterForm({
  filter,
  action,
  ownRank = null,
}: {
  filter: BoardFilter;
  action: string;
  ownRank?: Rank | null;
}) {
  const t = await getMessages(scrimsPageMessages);
  const shared = await getMessages(scrimSharedMessages);
  return (
    // Keyed by the applied filter: soft navigations would otherwise keep stale select values.
    <form
      key={`${filter.date ?? ""}|${filter.ranks.join(",")}|${filter.fullyVerifiedOnly}|${filter.reliableOnly}`}
      method="get"
      action={action}
      className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_1fr_auto_auto] lg:grid-cols-[minmax(0,18rem)_minmax(0,18rem)_auto_auto] lg:justify-start"
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
      {/* Below the row from 640 px, between the fields and the buttons on phones. */}
      <CheckboxFilters
        fullyVerifiedOnly={filter.fullyVerifiedOnly}
        reliableOnly={filter.reliableOnly}
        className="col-span-full sm:order-last"
      />
      <Button type="submit" variant="outline" className="px-[18px]">
        {t.filter}
      </Button>
      <Link href={action} className={buttonVariants({ variant: "ghost", className: "px-2.5" })}>
        {t.reset}
      </Link>
    </form>
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
