import {
  describeStartDay,
  describeStartShort,
  formatBerlinWeekday,
  getBoard,
  getMyScrims,
  toBerlinTimeString,
} from "@uni-scrims/core";
import { TIMING } from "@uni-scrims/core/config/timing";
import { cn } from "cn";
import Link from "next/link";
import {
  BoardFilterForm,
  BoardRequestList,
  ReadyWindowList,
  isBoardFiltered,
  readBoardRanks,
} from "@/components/board";
import { ActionForm } from "@/components/action-form";
import { DiscordContact } from "@/components/discord-contact";
import { EmptyState } from "@/components/empty-state";
import { readCheckboxFilters } from "@/components/filter-checkbox";
import {
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  MessageSquareIcon,
  PlusIcon,
  ZapIcon,
} from "@/components/icons";
import { CARD_COLUMNS, ListGroup } from "@/components/list-group";
import { PageMain } from "@/components/page-main";
import { RankRangeLabel } from "@/components/rank-icon";
import { TabNav } from "@/components/tab-nav";
import { type AvatarTeam, TeamAvatar } from "@/components/team-avatar";
import { Alert } from "@/components/ui/alert";
import { Badge, BadgeDot } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { single } from "@/lib/search-params";
import { requirePageUser } from "@/lib/session";
import {
  SCRIM_STATUS_LABELS,
  formatFormat,
  formatMaps,
  formatUniversities,
} from "@/lib/scrim-format";
import { getLocale, getMessages, getText } from "@/lib/locale";
import { formatMessages } from "@/i18n/format";
import { rematchHref } from "@/lib/rematch";
import { endReadyWindowAction, endRequestSeriesAction } from "../requests/actions";
import { readyWindowMessages, scrimSharedMessages, scrimsPageMessages } from "@/i18n/scrims";

type Board = Awaited<ReturnType<typeof getBoard>>;
type MyScrims = Awaited<ReturnType<typeof getMyScrims>>;
type PageMessages = (typeof scrimsPageMessages)["de"];

// Board and Meine Scrims as one page (SPEC N-9); the board is the default tab. The keys are the
// German ?tab= values in the URL, in both languages (§5.21).
const TAB_KEYS = ["board", "anstehend", "anfragen", "bewerbungen", "vergangen"] as const;
type TabKey = (typeof TAB_KEYS)[number];
type OwnTabKey = Exclude<TabKey, "board">;

function tabLabels(t: PageMessages): Record<TabKey, string> {
  return {
    board: t.tabs.board,
    anstehend: t.tabs.upcoming,
    anfragen: t.tabs.requests,
    bewerbungen: t.tabs.applications,
    vergangen: t.tabs.past,
  };
}

function tabHref(key: TabKey): string {
  return key === "board" ? "/scrims" : `/scrims?tab=${key}`;
}

function emptyStates(
  t: PageMessages,
): Record<OwnTabKey, { title: string; text: string; cta: string; href: string }> {
  return {
    anstehend: { ...t.empty.upcoming, href: "/scrims" },
    anfragen: { ...t.empty.requests, href: "/requests/new" },
    bewerbungen: { ...t.empty.applications, href: "/scrims" },
    vergangen: { ...t.empty.past, href: "/scrims" },
  };
}

const rowClass =
  "flex items-center gap-3 rounded-lg border border-border bg-card p-4 hover:bg-secondary";

export default async function ScrimsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser("/scrims");
  const params = await searchParams;
  const t = await getMessages(scrimsPageMessages);
  const shared = await getMessages(scrimSharedMessages);
  const tab: TabKey = TAB_KEYS.find((key) => key === params.tab) ?? "board";
  const now = new Date();
  const [board, mine] = await Promise.all([
    getBoard({
      userId: user.id,
      date: single(params.datum) ?? null,
      ranks: readBoardRanks(params.rang),
      ...readCheckboxFilters(params),
      now,
    }),
    getMyScrims({ userId: user.id, now }),
  ]);
  const counts: Record<TabKey, number> = {
    // Requests and windows "Heute spielbereit" of other teams (SPEC N-27).
    board: board.requests.length + board.readyWindows.length,
    anstehend: mine.upcoming.length,
    // Own open requests and direct requests to the team (SPEC N-26).
    anfragen: mine.requests.length + mine.incoming.length,
    bewerbungen: mine.applications.length,
    vergangen: mine.past.length,
  };
  const feedbackDue = mine.past.find((scrim) => scrim.canGiveFeedback);
  const labels = tabLabels(t);
  const empty = emptyStates(t);

  return (
    <PageMain width="wide" className="gap-6">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <h1 className="type-h1">{t.title}</h1>
        {board.ownTeam?.isCaptain ? (
          <div className="flex flex-wrap gap-3 max-sm:basis-full">
            {/* Hidden while the team's window runs: it is ended on the board (SPEC N-27). */}
            {board.ownReadyWindow ? null : (
              <Link
                href="/ready"
                className={buttonVariants({ variant: "outline", className: "max-sm:flex-1" })}
              >
                <ZapIcon size={18} strokeWidth={2.2} />
                {t.readyToday}
              </Link>
            )}
            <Link href="/requests/new" className={buttonVariants({ className: "max-sm:flex-1" })}>
              <PlusIcon size={18} strokeWidth={2.5} />
              {shared.createRequest}
            </Link>
          </div>
        ) : null}
      </div>

      {feedbackDue ? (
        <Link
          href={`/scrims/${feedbackDue.id}`}
          className="flex items-center gap-3 rounded-sm border border-primary bg-accent-soft px-4 py-3.5 hover:bg-accent-soft-hover"
        >
          <MessageSquareIcon size={20} />
          <span className="flex-1 text-[14px]">
            <span className="font-semibold">{t.feedbackDue(feedbackDue.opponent.name)}</span>{" "}
            <span className="text-muted-foreground">{t.giveQuickFeedback}</span>
          </span>
          <ChevronRightIcon size={18} strokeWidth={2.5} />
        </Link>
      ) : null}

      <TabNav
        label={t.title}
        items={TAB_KEYS.map((key) => ({
          href: tabHref(key),
          label: labels[key],
          active: key === tab,
          trailing: <span className="font-label text-[11px] text-faint">{counts[key]}</span>,
        }))}
      />

      {tab === "board" ? (
        <BoardTab board={board} hasOwnRequests={mine.requests.length > 0} />
      ) : !mine.team ? (
        <Alert>
          <span>
            {shared.noTeam((label) => (
              <Link href="/team" className="font-semibold underline underline-offset-2">
                {label}
              </Link>
            ))}
          </span>
        </Alert>
      ) : counts[tab] === 0 && !(tab === "anfragen" && mine.series.length > 0) ? (
        <EmptyState
          compact
          title={empty[tab].title}
          action={
            <Link
              href={empty[tab].href}
              className={buttonVariants({
                variant: "outline",
                size: "sm",
                className: "px-[18px]",
              })}
            >
              {empty[tab].cta}
            </Link>
          }
        >
          {empty[tab].text}
        </EmptyState>
      ) : tab === "anstehend" ? (
        <Upcoming mine={mine} ownTeam={mine.team} />
      ) : tab === "anfragen" ? (
        <Requests mine={mine} />
      ) : tab === "bewerbungen" ? (
        <Applications mine={mine} />
      ) : (
        <Past mine={mine} />
      )}
    </PageMain>
  );
}

/** Open requests of other teams with the filters of SPEC P0-4; the own ones are in "Anfragen". */
async function BoardTab({ board, hasOwnRequests }: { board: Board; hasOwnRequests: boolean }) {
  const t = await getMessages(scrimsPageMessages);
  const shared = await getMessages(scrimSharedMessages);
  const filtered = isBoardFiltered(board.filter);
  return (
    <>
      {board.ownReadyWindow ? <OwnReadyWindow window={board.ownReadyWindow} /> : null}
      <BoardFilterForm filter={board.filter} action="/scrims" ownRank={board.ownTeam?.rank} />
      <ReadyWindowList
        windows={board.readyWindows}
        actingTeamId={board.ownTeam?.id ?? null}
        signedIn
      />

      {board.requests.length === 0 && hasOwnRequests ? (
        <EmptyState title={filtered ? t.noMatchingOtherRequests : t.noOtherRequests}>
          {t.ownRequestsElsewhere}
        </EmptyState>
      ) : board.requests.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon size={26} strokeWidth={1.8} />}
          title={filtered ? t.noMatchingRequests : t.noOpenRequests}
          action={
            board.ownTeam?.isCaptain ? (
              <Link href="/requests/new" className={buttonVariants()}>
                {shared.createRequest}
              </Link>
            ) : null
          }
        >
          {/* Not "be the first" right below teams that are ready today (SPEC N-27). */}
          {filtered
            ? t.noRequestsForFilter
            : board.readyWindows.length > 0
              ? t.noRequestsBesideReady
              : t.beFirstTeam}
        </EmptyState>
      ) : (
        <BoardRequestList requests={board.requests} />
      )}
    </>
  );
}

/**
 * The active team's window "Heute spielbereit" for all members (SPEC N-27), with its open requests
 * and "Beenden" for the captain.
 */
async function OwnReadyWindow({ window }: { window: NonNullable<Board["ownReadyWindow"]> }) {
  const locale = await getLocale();
  const text = await getText();
  const t = await getMessages(readyWindowMessages);
  return (
    <div className="flex flex-col gap-3 rounded-sm border border-primary bg-accent-soft px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <ZapIcon size={20} className="mt-0.5 shrink-0" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-semibold">{t.ownTitle}</span>
          <span className="text-[13px] text-pretty text-muted-foreground">
            {t.startBetween(
              toBerlinTimeString(window.firstStartsAt),
              toBerlinTimeString(window.lastStartsAt),
            )}{" "}
            · {formatFormat(window.format, locale)} ·{" "}
            <RankRangeLabel rankMin={window.rankMin} rankMax={window.rankMax} /> ·{" "}
            {formatMaps(window.maps, locale)}
          </span>
          {window.openRequestCount > 0 ? (
            <Link
              href="/scrims?tab=anfragen"
              className="text-[13px] font-semibold text-accent-text underline-offset-2 hover:underline"
            >
              {t.openRequests(window.openRequestCount)}
            </Link>
          ) : (
            <span className="text-[13px] text-muted-foreground">{t.openRequests(0)}</span>
          )}
        </div>
      </div>
      {window.end ? (
        window.end.problem === null ? (
          <ActionForm
            action={endReadyWindowAction}
            submitLabel={t.end}
            variant="outline"
            size="sm"
            confirmText={t.confirmEnd}
            confirmDestructive
            className="shrink-0"
          >
            <input type="hidden" name="windowId" value={window.id} />
          </ActionForm>
        ) : (
          <p className="text-[13px] text-muted-foreground">{text(window.end.problem)}</p>
        )
      ) : null}
    </div>
  );
}

async function Upcoming({ mine, ownTeam }: { mine: MyScrims; ownTeam: AvatarTeam }) {
  const locale = await getLocale();
  const t = await getMessages(scrimsPageMessages);
  const shared = await getMessages(scrimSharedMessages);
  return (
    <div className={cn(CARD_COLUMNS, "gap-6")}>
      {mine.upcoming.map((scrim) => (
        <div
          key={scrim.id}
          className="flex flex-col gap-[18px] rounded-lg border border-border bg-card p-5"
        >
          <Link href={`/scrims/${scrim.id}`} className="group flex flex-col gap-[18px]">
            <div className="flex items-center justify-between gap-2.5">
              <Badge variant="success">
                <BadgeDot />
                {t.confirmed}
              </Badge>
              <span className="font-label text-[13px]">
                {describeStartShort(scrim.startsAt, locale)}
              </span>
            </div>
            <div className="flex items-center gap-3.5">
              <div className="flex shrink-0 items-center">
                <TeamAvatar
                  team={ownTeam}
                  own
                  className={cn(
                    "relative z-[1] shadow-[0_0_0_3px_var(--card)]",
                    // A transparent logo would let the opponent show through underneath.
                    ownTeam.logo !== null && "bg-card",
                  )}
                />
                <TeamAvatar team={scrim.opponent} className="-ml-2" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="type-h2 group-hover:underline">
                  {shared.versus(scrim.opponent.name)}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {formatUniversities(scrim.opponent.universities, locale)} ·{" "}
                  {formatFormat(scrim.format, locale)}
                  {/* A scrim from a direct request has no rank range (SPEC N-26). */}
                  {scrim.direct ? null : (
                    <>
                      {" "}
                      · <RankRangeLabel rankMin={scrim.rankMin} rankMax={scrim.rankMax} />
                    </>
                  )}
                </span>
              </div>
            </div>
          </Link>
          <DiscordContact
            captainName={scrim.opponent.captainName}
            captainDiscordId={scrim.opponent.captainDiscordId}
            teamName={scrim.opponent.name}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Direct requests to the team (SPEC N-26), own open requests, then the running weekly series and
 * fixed partnerships (SPEC N-25, N-26); the tab counts the open and the incoming requests.
 */
async function Requests({ mine }: { mine: MyScrims }) {
  const t = await getMessages(scrimsPageMessages);
  const incoming = mine.incoming.length > 0;
  return (
    <div className="flex flex-col gap-8">
      {incoming ? (
        <ListGroup title={t.incomingTitle} count={String(mine.incoming.length)}>
          <IncomingRequests mine={mine} />
        </ListGroup>
      ) : null}
      {mine.requests.length > 0 ? (
        incoming ? (
          <ListGroup title={t.ownRequestsTitle} count={String(mine.requests.length)}>
            <OpenRequests mine={mine} />
          </ListGroup>
        ) : (
          <div className={cn(CARD_COLUMNS, "gap-6")}>
            <OpenRequests mine={mine} />
          </div>
        )
      ) : mine.series.some((entry) => entry.partner === null) ? (
        <p className="text-[14px] text-pretty text-muted-foreground">{t.noOpenRequestNow}</p>
      ) : null}
      {mine.series.length > 0 ? <SeriesList series={mine.series} /> : null}
    </div>
  );
}

/** Direct requests to the team: open the request page to accept or decline (SPEC N-26). */
async function IncomingRequests({ mine }: { mine: MyScrims }) {
  const locale = await getLocale();
  const t = await getMessages(scrimsPageMessages);
  const ready = await getMessages(readyWindowMessages);
  return mine.incoming.map((request) => (
    <Link
      key={request.id}
      href={`/requests/${request.id}`}
      className="flex flex-col gap-4 rounded-lg border border-primary bg-card p-5 hover:bg-secondary"
    >
      <div className="flex items-center gap-3">
        <TeamAvatar team={request.team} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-semibold break-words">{request.team.name}</span>
          <span className="text-[13px] text-muted-foreground">
            {describeStartShort(request.startsAt, locale)} · {formatFormat(request.format, locale)}{" "}
            · {formatMaps(request.maps, locale)}
          </span>
          {request.weeklyUntil ? (
            <span className="text-[13px] text-muted-foreground">
              {t.partnershipUntil(describeStartDay(request.weeklyUntil, locale))}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border pt-3.5">
        {request.readyWindow ? (
          <Badge>{ready.badge}</Badge>
        ) : request.weeklyUntil ? (
          <Badge>{t.weekly}</Badge>
        ) : (
          <span />
        )}
        <span className="flex items-center gap-0.5 text-[14px] font-semibold text-accent-text">
          {t.answerNow}
          <ChevronRightIcon strokeWidth={2.5} />
        </span>
      </div>
    </Link>
  ));
}

async function OpenRequests({ mine }: { mine: MyScrims }) {
  const locale = await getLocale();
  const t = await getMessages(scrimsPageMessages);
  const ready = await getMessages(readyWindowMessages);
  const shared = await getMessages(scrimSharedMessages);
  return (
    <>
      {mine.requests.map((request) => (
        <Link
          key={request.id}
          href={`/requests/${request.id}`}
          className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 hover:border-border-strong hover:bg-secondary"
        >
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="type-h2">{describeStartShort(request.startsAt, locale)}</span>
              <span className="text-[13px] text-muted-foreground">
                {formatFormat(request.format, locale)} ·{" "}
                {/* A direct request has no rank range (SPEC N-26). */}
                {request.target ? null : (
                  <>
                    <RankRangeLabel rankMin={request.rankMin} rankMax={request.rankMax} /> ·{" "}
                  </>
                )}
                {formatMaps(request.maps, locale)}
              </span>
            </div>
            <span className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row">
              {request.weekly || request.weeklyUntil ? <Badge>{t.weekly}</Badge> : null}
              {/* For a start time in another team's window (SPEC N-27). */}
              {request.readyWindow ? <Badge>{ready.badge}</Badge> : null}
              <Badge variant="accent">{t.open}</Badge>
            </span>
          </div>
          {request.target ? (
            <div className="flex min-w-0 items-center gap-2.5">
              <TeamAvatar team={request.target} size="sm" />
              <span className="flex min-w-0 flex-col">
                <span className="text-[14px] font-semibold break-words">
                  {t.directTo(request.target.name)}
                </span>
                {request.weeklyUntil ? (
                  <span className="text-[13px] text-muted-foreground">
                    {t.partnershipUntil(describeStartDay(request.weeklyUntil, locale))}
                  </span>
                ) : null}
              </span>
            </div>
          ) : null}
          <div className="flex items-center justify-between border-t border-border pt-3.5">
            <span className="type-label text-muted-foreground">
              {request.target
                ? t.awaitingAnswer
                : shared.applicationsWithCount(request.applicationCount)}
            </span>
            <span className="flex items-center gap-0.5 text-[14px] font-semibold text-accent-text">
              {shared.view}
              <ChevronRightIcon strokeWidth={2.5} />
            </span>
          </div>
        </Link>
      ))}
    </>
  );
}

/**
 * Running series: when the next request appears or why it waits, and "Serie beenden" for the
 * captain. Not links, unlike the request cards, because they hold a form.
 */
async function SeriesList({ series }: { series: MyScrims["series"] }) {
  const locale = await getLocale();
  const t = await getMessages(scrimsPageMessages);
  const text = await getText();
  return (
    <ListGroup title={t.seriesTitle} count={String(series.length)}>
      {series.map((entry) => {
        const minutes = Math.round(TIMING.MIN_REQUEST_LEAD / 60_000);
        // A fixed partnership books its dates and waits only for verified captains (SPEC N-26).
        const blocked = !entry.blocked
          ? undefined
          : entry.partner
            ? t.partnerBlocked[entry.blocked]?.(minutes)
            : t.blocked[entry.blocked as keyof typeof t.blocked]?.(minutes);
        const posts = entry.partner
          ? entry.due
            ? t.booksSoon
            : t.booksAt(describeStartShort(entry.postsAt, locale))
          : entry.due
            ? t.postsSoon
            : t.postsAt(describeStartShort(entry.postsAt, locale));
        return (
          <div
            key={entry.id}
            className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="type-h2">
                {t.everyWeekday(formatBerlinWeekday(entry.nextStartsAt, locale))}
              </span>
              {entry.partner ? (
                <span className="flex min-w-0 items-center gap-2 py-1">
                  <TeamAvatar team={entry.partner} size="sm" />
                  <span className="min-w-0 text-[14px] font-semibold break-words">
                    {t.partner(entry.partner.name)}
                  </span>
                </span>
              ) : null}
              <span className="text-[13px] text-muted-foreground">
                {formatFormat(entry.format, locale)} ·{" "}
                {entry.partner ? null : (
                  <>
                    <RankRangeLabel rankMin={entry.rankMin} rankMax={entry.rankMax} /> ·{" "}
                  </>
                )}
                {formatMaps(entry.maps, locale)}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-[14px]">
              <div className="flex min-w-0 flex-col gap-0.5">
                <dt className="type-label text-muted-foreground">{t.nextDate}</dt>
                <dd className="font-semibold">{describeStartShort(entry.nextStartsAt, locale)}</dd>
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <dt className="type-label text-muted-foreground">{t.lastDate}</dt>
                <dd className="font-semibold">{describeStartDay(entry.lastStartsAt, locale)}</dd>
              </div>
            </dl>
            <p
              className={cn(
                "text-[13px] text-pretty",
                blocked ? "text-warning" : "text-muted-foreground",
              )}
            >
              {blocked ?? posts}
            </p>
            {entry.end ? (
              <div className="border-t border-border pt-3.5">
                {entry.end.problem === null ? (
                  <ActionForm
                    action={endRequestSeriesAction}
                    submitLabel={entry.partner ? t.endPartnership : t.endSeries}
                    variant="outline"
                    size="sm"
                    confirmText={
                      entry.partner
                        ? t.confirmEndPartnership(entry.partner.name)
                        : t.confirmEndSeries
                    }
                    confirmDestructive
                  >
                    <input type="hidden" name="seriesId" value={entry.id} />
                    {entry.partner ? <input type="hidden" name="partnership" value="1" /> : null}
                  </ActionForm>
                ) : (
                  <p className="text-[13px] text-muted-foreground">{text(entry.end.problem)}</p>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </ListGroup>
  );
}

async function Applications({ mine }: { mine: MyScrims }) {
  const locale = await getLocale();
  const t = await getMessages(scrimsPageMessages);
  return (
    <div className={cn(CARD_COLUMNS, "gap-2.5")}>
      {mine.applications.map((application) => (
        <Link key={application.id} href={`/requests/${application.requestId}`} className={rowClass}>
          <TeamAvatar team={application.team} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold">{application.team.name}</span>
            <span className="text-[13px] text-muted-foreground">
              {describeStartShort(application.startsAt, locale)} ·{" "}
              {formatFormat(application.format, locale)}
            </span>
          </div>
          {application.status === "PENDING" ? (
            <Badge variant="warning">
              <BadgeDot />
              {t.pending}
            </Badge>
          ) : (
            <Badge>{formatMessages[locale].applicationStatus[application.status]}</Badge>
          )}
        </Link>
      ))}
    </div>
  );
}

async function Past({ mine }: { mine: MyScrims }) {
  const locale = await getLocale();
  const t = await getMessages(scrimsPageMessages);
  const shared = await getMessages(scrimSharedMessages);
  return (
    <div className={cn(CARD_COLUMNS, "gap-2.5")}>
      {mine.past.map((scrim) => {
        const row = (
          <>
            <TeamAvatar team={scrim.opponent} />
            <div className="flex min-w-[140px] flex-1 flex-col">
              <span className="font-semibold">{shared.versus(scrim.opponent.name)}</span>
              <span className="text-[13px] text-muted-foreground">
                {describeStartShort(scrim.startsAt, locale)} · {formatFormat(scrim.format, locale)}
                {scrim.status === "SCHEDULED"
                  ? ""
                  : ` · ${SCRIM_STATUS_LABELS[locale][scrim.status]}`}
              </span>
            </div>
            {scrim.canGiveFeedback ? (
              <span className={buttonVariants({ size: "sm", className: "shrink-0" })}>
                {t.giveFeedback}
              </span>
            ) : scrim.feedbackGiven ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] text-success">
                <CheckIcon size={14} strokeWidth={3} />
                {t.feedbackGiven}
              </span>
            ) : null}
          </>
        );
        // "Nochmal gegen dieses Team" next to the row, as a link of its own (SPEC N-26).
        return scrim.rematch ? (
          <div
            key={scrim.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4"
          >
            <Link
              href={`/scrims/${scrim.id}`}
              className="flex min-w-[220px] flex-1 flex-wrap items-center gap-3 hover:underline"
            >
              {row}
            </Link>
            <Link
              href={rematchHref(scrim)}
              className={buttonVariants({ variant: "outline", size: "sm", className: "shrink-0" })}
            >
              {t.rematch}
            </Link>
          </div>
        ) : (
          <Link key={scrim.id} href={`/scrims/${scrim.id}`} className={cn(rowClass, "flex-wrap")}>
            {row}
          </Link>
        );
      })}
    </div>
  );
}
