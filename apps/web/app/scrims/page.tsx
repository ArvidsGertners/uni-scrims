import {
  describeStartShort,
  formatDayHeading,
  getBoard,
  getMyScrims,
  RANK_LABELS,
  RANKS,
  toBerlinDateString,
} from "@uni-scrims/core";
import type { Rank } from "@uni-scrims/db";
import { cn } from "cn";
import Link from "next/link";
import { DiscordContact } from "@/components/discord-contact";
import { EmptyState } from "@/components/empty-state";
import {
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  MessageSquareIcon,
  PlusIcon,
} from "@/components/icons";
import { CARD_COLUMNS, ListGroup } from "@/components/list-group";
import { PageMain } from "@/components/page-main";
import { RankIcon, RankRangeLabel } from "@/components/rank-icon";
import { RequestCard } from "@/components/request-card";
import { TabNav } from "@/components/tab-nav";
import { type AvatarTeam, TeamAvatar } from "@/components/team-avatar";
import { Alert } from "@/components/ui/alert";
import { Badge, BadgeDot } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { requirePageUser } from "@/lib/session";
import {
  SCRIM_STATUS_LABELS,
  formatFormat,
  formatMaps,
  formatUniversities,
} from "@/lib/scrim-format";
import { RankFilter } from "./rank-filter";
import { getLocale } from "@/lib/locale";
import { formatMessages } from "@/i18n/format";
import type { Locale } from "@uni-scrims/core/config/locale";

type Board = Awaited<ReturnType<typeof getBoard>>;
type MyScrims = Awaited<ReturnType<typeof getMyScrims>>;

// Board and Meine Scrims as one page (SPEC N-9); the board is the default tab.
const TABS = [
  { key: "board", label: "Board" },
  { key: "anstehend", label: "Anstehend" },
  { key: "anfragen", label: "Anfragen" },
  { key: "bewerbungen", label: "Bewerbungen" },
  { key: "vergangen", label: "Vergangen" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
type OwnTabKey = Exclude<TabKey, "board">;

function tabHref(key: TabKey): string {
  return key === "board" ? "/scrims" : `/scrims?tab=${key}`;
}

const EMPTY: Record<OwnTabKey, { title: string; text: string; cta: string; href: string }> = {
  anstehend: {
    title: "Noch keine bestätigten Scrims",
    text: "Bewirb dich auf dem Board oder erstelle eine eigene Anfrage.",
    cta: "Zum Board",
    href: "/scrims",
  },
  anfragen: {
    title: "Keine offenen Anfragen",
    text: "Erstelle eine Anfrage, damit sich andere Uni-Teams bei euch bewerben können.",
    cta: "Anfrage erstellen",
    href: "/requests/new",
  },
  bewerbungen: {
    title: "Noch keine Bewerbungen",
    text: "Auf dem Board findest du offene Anfragen anderer Teams.",
    cta: "Zum Board",
    href: "/scrims",
  },
  vergangen: {
    title: "Noch keine gespielten Scrims",
    text: "Nach jedem Match kannst du hier kurz Feedback geben.",
    cta: "Zum Board",
    href: "/scrims",
  },
};

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function list(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : typeof value === "string" ? [value] : value;
}

function requestCountLabel(count: number): string {
  return count === 1 ? "1 Anfrage" : `${count} Anfragen`;
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

const rowClass =
  "flex items-center gap-3 rounded-lg border border-border bg-card p-4 hover:bg-secondary";

export default async function ScrimsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser("/scrims");
  const params = await searchParams;
  const tab: TabKey = TABS.find((t) => t.key === params.tab)?.key ?? "board";
  const rankParams = list(params.rang);
  const now = new Date();
  const [board, mine] = await Promise.all([
    getBoard({
      userId: user.id,
      date: single(params.datum) ?? null,
      ranks: rankParams.includes("ALL")
        ? "ALL"
        : rankParams.filter((value): value is Rank => RANKS.includes(value as Rank)),
      now,
    }),
    getMyScrims({ userId: user.id, now }),
  ]);
  const counts: Record<TabKey, number> = {
    board: board.requests.length,
    anstehend: mine.upcoming.length,
    anfragen: mine.requests.length,
    bewerbungen: mine.applications.length,
    vergangen: mine.past.length,
  };
  const feedbackDue = mine.past.find((scrim) => scrim.canGiveFeedback);

  return (
    <PageMain width="wide" className="gap-6">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <h1 className="type-h1">Scrims</h1>
        {board.ownTeam?.isCaptain ? (
          <Link href="/requests/new" className={buttonVariants({ className: "max-sm:basis-full" })}>
            <PlusIcon size={18} strokeWidth={2.5} />
            Anfrage erstellen
          </Link>
        ) : null}
      </div>

      {feedbackDue ? (
        <Link
          href={`/scrims/${feedbackDue.id}`}
          className="flex items-center gap-3 rounded-sm border border-primary bg-accent-soft px-4 py-3.5 hover:bg-accent-soft-hover"
        >
          <MessageSquareIcon size={20} />
          <span className="flex-1 text-[14px]">
            <span className="font-semibold">Wie war&apos;s gegen {feedbackDue.opponent.name}?</span>{" "}
            <span className="text-muted-foreground">Kurzes Feedback geben</span>
          </span>
          <ChevronRightIcon size={18} strokeWidth={2.5} />
        </Link>
      ) : null}

      <TabNav
        label="Scrims"
        items={TABS.map((t) => ({
          href: tabHref(t.key),
          label: t.label,
          active: t.key === tab,
          trailing: <span className="font-label text-[11px] text-faint">{counts[t.key]}</span>,
        }))}
      />

      {tab === "board" ? (
        <BoardTab board={board} hasOwnRequests={mine.requests.length > 0} />
      ) : !mine.team ? (
        <Alert>
          <span>
            Du bist in keinem Team.{" "}
            <Link href="/team" className="font-semibold underline underline-offset-2">
              Team gründen oder beitreten
            </Link>
          </span>
        </Alert>
      ) : counts[tab] === 0 ? (
        <EmptyState
          compact
          title={EMPTY[tab].title}
          action={
            <Link
              href={EMPTY[tab].href}
              className={buttonVariants({
                variant: "outline",
                size: "sm",
                className: "px-[18px]",
              })}
            >
              {EMPTY[tab].cta}
            </Link>
          }
        >
          {EMPTY[tab].text}
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
  const locale = await getLocale();
  const filtered = board.filter.date !== null || board.filter.ranks.length > 0;
  return (
    <>
      {/* Keyed by the applied filter: soft navigations would otherwise keep stale select values. */}
      <form
        key={`${board.filter.date ?? ""}|${board.filter.ranks.join(",")}`}
        method="get"
        action="/scrims"
        className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_1fr_auto_auto] lg:grid-cols-[minmax(0,18rem)_minmax(0,18rem)_auto_auto] lg:justify-start"
      >
        <Field label="Datum">
          <DatePicker
            name="datum"
            defaultValue={board.filter.date}
            placeholder="Alle Tage"
            clearable
          />
        </Field>
        <Field label="Rang im Bereich">
          <RankFilter
            defaultValue={board.filter.ranks}
            options={RANKS.map((value) => ({
              value,
              label: RANK_LABELS[value],
              icon: <RankIcon rank={value} />,
              hint: value === board.ownTeam?.rank ? "euer Rang" : undefined,
            }))}
          />
        </Field>
        <Button type="submit" variant="outline" className="px-[18px]">
          Filtern
        </Button>
        <Link href="/scrims" className={buttonVariants({ variant: "ghost", className: "px-2.5" })}>
          Zurücksetzen
        </Link>
      </form>

      {board.requests.length === 0 && hasOwnRequests ? (
        <EmptyState
          title={
            filtered ? "Keine passenden Anfragen anderer Teams" : "Noch keine anderen Anfragen"
          }
        >
          Eure eigenen Anfragen stehen unter „Anfragen“. Anfragen anderer Uni-Teams erscheinen hier.
        </EmptyState>
      ) : board.requests.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon size={26} strokeWidth={1.8} />}
          title={filtered ? "Keine passenden Anfragen" : "Gerade keine offenen Anfragen"}
          action={
            board.ownTeam?.isCaptain ? (
              <Link href="/requests/new" className={buttonVariants()}>
                Anfrage erstellen
              </Link>
            ) : null
          }
        >
          {filtered
            ? "Für diese Filter gibt es gerade keine offenen Anfragen anderer Teams."
            : "Seid das erste Team auf dem Board. Andere Uni-Teams können sich dann bei euch bewerben."}
        </EmptyState>
      ) : (
        groupByDay(board.requests, locale).map((group) => (
          <ListGroup
            key={group.day}
            title={group.title}
            count={requestCountLabel(group.requests.length)}
          >
            {group.requests.map((request) => (
              <RequestCard key={request.id} request={request} />
            ))}
          </ListGroup>
        ))
      )}
    </>
  );
}

async function Upcoming({ mine, ownTeam }: { mine: MyScrims; ownTeam: AvatarTeam }) {
  const locale = await getLocale();
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
                Bestätigt
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
                <span className="type-h2 group-hover:underline">gegen {scrim.opponent.name}</span>
                <span className="text-[13px] text-muted-foreground">
                  {formatUniversities(scrim.opponent.universities, locale)} ·{" "}
                  {formatFormat(scrim.format, locale)} ·{" "}
                  <RankRangeLabel rankMin={scrim.rankMin} rankMax={scrim.rankMax} />
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

async function Requests({ mine }: { mine: MyScrims }) {
  const locale = await getLocale();
  return (
    <div className={cn(CARD_COLUMNS, "gap-6")}>
      {mine.requests.map((request) => (
        <Link
          key={request.id}
          href={`/requests/${request.id}`}
          className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 hover:border-border-strong hover:bg-secondary"
        >
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex flex-col gap-0.5">
              <span className="type-h2">{describeStartShort(request.startsAt, locale)}</span>
              <span className="text-[13px] text-muted-foreground">
                {formatFormat(request.format, locale)} ·{" "}
                <RankRangeLabel rankMin={request.rankMin} rankMax={request.rankMax} /> ·{" "}
                {formatMaps(request.maps, locale)}
              </span>
            </div>
            <Badge variant="accent">Offen</Badge>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-3.5">
            <span className="type-label text-muted-foreground">
              Bewerbungen ({request.applicationCount})
            </span>
            <span className="flex items-center gap-0.5 text-[14px] font-semibold text-accent-text">
              Ansehen
              <ChevronRightIcon strokeWidth={2.5} />
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

async function Applications({ mine }: { mine: MyScrims }) {
  const locale = await getLocale();
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
              Ausstehend
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
  return (
    <div className={cn(CARD_COLUMNS, "gap-2.5")}>
      {mine.past.map((scrim) => (
        <Link key={scrim.id} href={`/scrims/${scrim.id}`} className={cn(rowClass, "flex-wrap")}>
          <TeamAvatar team={scrim.opponent} />
          <div className="flex min-w-[140px] flex-1 flex-col">
            <span className="font-semibold">gegen {scrim.opponent.name}</span>
            <span className="text-[13px] text-muted-foreground">
              {describeStartShort(scrim.startsAt, locale)} · {formatFormat(scrim.format, locale)}
              {scrim.status === "SCHEDULED"
                ? ""
                : ` · ${SCRIM_STATUS_LABELS[locale][scrim.status]}`}
            </span>
          </div>
          {scrim.canGiveFeedback ? (
            <span className={buttonVariants({ size: "sm", className: "shrink-0" })}>
              Feedback geben
            </span>
          ) : scrim.feedbackGiven ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] text-success">
              <CheckIcon size={14} strokeWidth={3} />
              Feedback gegeben
            </span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}
