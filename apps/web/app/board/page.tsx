import { RANK_LABELS, RANKS, getBoard } from "@uni-scrims/core";
import type { Rank } from "@uni-scrims/db";
import Link from "next/link";
import { RequestCard } from "@/components/request-card";
import { selectClass } from "@/components/team-fields";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requirePageUser } from "@/lib/session";

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
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

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Scrim-Board</h1>
        {board.ownTeam?.isCaptain ? (
          <Link href="/requests/new" className={buttonVariants()}>
            Anfrage erstellen
          </Link>
        ) : null}
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="datum">Datum</Label>
          <Input id="datum" name="datum" type="date" defaultValue={board.filter.date ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rang">Rang im Bereich</Label>
          <select
            id="rang"
            name="rang"
            defaultValue={board.filter.rank ?? "ALL"}
            className={selectClass}
          >
            <option value="ALL">Alle Ränge</option>
            {RANKS.map((value) => (
              <option key={value} value={value}>
                {RANK_LABELS[value]}
                {value === board.ownTeam?.rank ? " (euer Rang)" : ""}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          Filtern
        </Button>
        <Link href="/board" className="text-sm underline">
          Zurücksetzen
        </Link>
      </form>

      {board.ownRequests.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Eure Anfragen</h2>
          {board.ownRequests.map((request) => (
            <RequestCard key={request.id} request={request} />
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Offene Anfragen</h2>
        {board.requests.length === 0 ? (
          <p className="text-sm opacity-70">Keine passenden Anfragen.</p>
        ) : (
          board.requests.map((request) => <RequestCard key={request.id} request={request} />)
        )}
      </section>
    </main>
  );
}
