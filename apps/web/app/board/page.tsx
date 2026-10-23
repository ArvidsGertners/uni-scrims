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
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { requirePageUser } from "@/lib/session";

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
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
  const rankParam = single(params.rang);
  const rank =
    rankParam === "ALL" ? "ALL" : RANKS.includes(rankParam as Rank) ? (rankParam as Rank) : null;
  const board = await getBoard({
    userId: user.id,
    date: single(params.datum) ?? null,
    rank,
    now: new Date(),
  });
  const filtered = board.filter.date !== null || board.filter.rank !== null;
  const count = board.requests.length;
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
            {count === 0
              ? "Keine offenen Anfragen"
              : count === 1
                ? "1 offene Anfrage"
                : `${count} offene Anfragen`}
          </span>
          <h1 className="type-h1">Scrim-Board</h1>
        </div>
        {createLink}
      </div>

      {/* Keyed by the applied filter: soft navigations would otherwise keep stale select values. */}
      <form
        key={`${board.filter.date ?? ""}|${board.filter.rank ?? "ALL"}`}
        method="get"
        className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_1fr_auto_auto]"
      >
        <Field label="Datum">
          <Input name="datum" type="date" defaultValue={board.filter.date ?? ""} />
        </Field>
        <Field label="Rang im Bereich">
          <NativeSelect name="rang" defaultValue={board.filter.rank ?? "ALL"}>
            <option value="ALL">Alle Ränge</option>
            {RANKS.map((value) => (
              <option key={value} value={value}>
                {RANK_LABELS[value]}
                {value === board.ownTeam?.rank ? " (euer Rang)" : ""}
              </option>
            ))}
          </NativeSelect>
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

      {count === 0 ? (
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
