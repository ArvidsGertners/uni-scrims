import {
  formatDayHeading,
  getBoard,
  RANK_LABELS,
  RANKS,
  toBerlinDateString,
} from "@uni-scrims/core";
import type { Rank } from "@uni-scrims/db";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { CalendarIcon, PlusIcon } from "@/components/icons";
import { ListGroup } from "@/components/list-group";
import { PageMain } from "@/components/page-main";
import { RequestCard } from "@/components/request-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { requirePageUser } from "@/lib/session";
import { RankFilter } from "./rank-filter";

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
function groupByDay<T extends { startsAt: Date }>(requests: T[]) {
  const groups: { day: string; title: string; requests: T[] }[] = [];
  for (const request of requests) {
    const day = toBerlinDateString(request.startsAt);
    const last = groups.at(-1);
    if (last?.day === day) last.requests.push(request);
    else groups.push({ day, title: formatDayHeading(request.startsAt), requests: [request] });
  }
  return groups;
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser("/board");
  const params = await searchParams;
  const rankParams = list(params.rang);
  const board = await getBoard({
    userId: user.id,
    date: single(params.datum) ?? null,
    ranks: rankParams.includes("ALL")
      ? "ALL"
      : rankParams.filter((value): value is Rank => RANKS.includes(value as Rank)),
    now: new Date(),
  });
  const filtered = board.filter.date !== null || board.filter.ranks.length > 0;
  const count = board.requests.length;
  const total = count + board.ownRequests.length;
  const createLink = board.ownTeam?.isCaptain ? (
    <Link href="/requests/new" className={buttonVariants({ className: "max-sm:basis-full" })}>
      <PlusIcon size={18} strokeWidth={2.5} />
      Anfrage erstellen
    </Link>
  ) : null;

  return (
    <PageMain className="gap-8">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-2">
          <span className="type-label text-muted-foreground">
            {total === 0
              ? "Keine offenen Anfragen"
              : total === 1
                ? "1 offene Anfrage"
                : `${total} offene Anfragen`}
          </span>
          <h1 className="type-h1">Scrim-Board</h1>
        </div>
        {createLink}
      </div>

      {/* Keyed by the applied filter: soft navigations would otherwise keep stale select values. */}
      <form
        key={`${board.filter.date ?? ""}|${board.filter.ranks.join(",")}`}
        method="get"
        className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_1fr_auto_auto]"
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
              hint: value === board.ownTeam?.rank ? "euer Rang" : undefined,
            }))}
          />
        </Field>
        <Button type="submit" variant="outline" className="px-[18px]">
          Filtern
        </Button>
        <Link href="/board" className={buttonVariants({ variant: "ghost", className: "px-2.5" })}>
          Zurücksetzen
        </Link>
      </form>

      {board.ownRequests.length > 0 ? (
        <ListGroup title="Eure Anfragen" count={requestCountLabel(board.ownRequests.length)}>
          {board.ownRequests.map((request) => (
            <RequestCard key={request.id} request={request} own />
          ))}
        </ListGroup>
      ) : null}

      {count === 0 && board.ownRequests.length > 0 ? (
        <EmptyState
          title={
            filtered ? "Keine passenden Anfragen anderer Teams" : "Noch keine anderen Anfragen"
          }
        >
          Eure Anfragen stehen auf dem Board. Anfragen anderer Uni-Teams erscheinen hier.
        </EmptyState>
      ) : count === 0 ? (
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
        groupByDay(board.requests).map((group) => (
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
    </PageMain>
  );
}
