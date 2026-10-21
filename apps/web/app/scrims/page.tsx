import { describeStart, getMyScrims } from "@uni-scrims/core";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SCRIM_STATUS_LABELS, formatFormat } from "@/lib/scrim-format";
import { requirePageUser } from "@/lib/session";

type Item = Awaited<ReturnType<typeof getMyScrims>>["upcoming"][number];

function ScrimList({ items, empty }: { items: Item[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm opacity-70">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((scrim) => (
        <li key={scrim.id}>
          <Link
            href={`/scrims/${scrim.id}`}
            className="flex flex-col gap-1 rounded-lg border p-3 hover:bg-muted"
          >
            <span className="flex flex-wrap items-center gap-2 font-medium">
              {describeStart(scrim.startsAt)}
              <Badge variant="outline">{SCRIM_STATUS_LABELS[scrim.status]}</Badge>
            </span>
            <span className="text-sm">
              gegen {scrim.opponent.name} <span className="opacity-60">[{scrim.opponent.tag}]</span>{" "}
              · {formatFormat(scrim.format)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function MyScrimsPage() {
  const user = await requirePageUser("/scrims");
  const scrims = await getMyScrims({ userId: user.id, now: new Date() });

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-bold">Meine Scrims</h1>
      {!scrims.hasTeam ? (
        <p className="text-sm">
          Du bist in keinem Team.{" "}
          <Link href="/team" className="underline">
            Team anlegen oder beitreten
          </Link>
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Anstehend</h2>
            <ScrimList items={scrims.upcoming} empty="Keine anstehenden Scrims." />
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Vergangen und abgesagt</h2>
            <ScrimList items={scrims.past} empty="Noch keine vergangenen Scrims." />
          </section>
        </>
      )}
    </main>
  );
}
