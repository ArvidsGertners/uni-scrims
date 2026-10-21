import {
  type ProblemKind,
  RANK_LABELS,
  RANKS,
  REQUEST_NOTE_MAX,
  SCRIM_FORMAT_LABELS,
  START_TIME_SLOTS,
  getRequestForm,
  toBerlinDateString,
} from "@uni-scrims/core";
import { MAP_POOL } from "@uni-scrims/core/config/maps";
import type { Rank, ScrimFormat } from "@uni-scrims/db";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { selectClass } from "@/components/team-fields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requirePageUser } from "@/lib/session";
import { createRequestAction } from "../actions";

/** Where each reason can be fixed; a ban is final, so it gets no link. */
const PROBLEM_LINKS: Partial<Record<ProblemKind, { href: string; label: string }>> = {
  NOT_CAPTAIN: { href: "/team", label: "Wer ist euer Captain?" },
  CAPTAIN_NOT_VERIFIED: { href: "/verify", label: "Zur Verifizierung" },
  TEAM_NOT_READY: { href: "/team", label: "Zum Team" },
  REQUEST_LIMIT: { href: "/board", label: "Zum Board (eure Anfragen)" },
};

export default async function NewRequestPage() {
  const user = await requirePageUser("/requests/new");
  const form = await getRequestForm({ userId: user.id, now: new Date() });

  if (!form) {
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-8">
        <h1 className="text-2xl font-bold">Anfrage erstellen</h1>
        <p className="text-sm">Du bist in keinem Team.</p>
        <Link href="/team" className="text-sm underline">
          Team anlegen oder beitreten
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-bold">Anfrage erstellen</h1>
      {/* The reasons core's createRequest would reject with (§7), shown before the form. */}
      {form.problems.length > 0 ? (
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm">
          {form.problems.map(({ kind, message }) => {
            const link = PROBLEM_LINKS[kind];
            return (
              <li key={kind}>
                <span className="text-destructive">{message}</span>
                {link ? (
                  <>
                    {" "}
                    <Link href={link.href} className="underline">
                      {link.label}
                    </Link>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <RequestForm defaultRank={form.rank} />
      )}
    </main>
  );
}

function RequestForm({ defaultRank }: { defaultRank: Rank }) {
  return (
    <ActionForm action={createRequestAction} submitLabel="Anfrage posten">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="date">Datum</Label>
          <Input id="date" name="date" type="date" required min={toBerlinDateString(new Date())} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="time">Startzeit</Label>
          <select id="time" name="time" required defaultValue="20:00" className={selectClass}>
            {START_TIME_SLOTS.map((slot) => (
              <option key={slot} value={slot}>
                {slot} Uhr
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs opacity-70">
        Uhrzeiten in deutscher Zeit. Für Starts nach Mitternacht (00:00–01:45) das Datum des
        Folgetags wählen, z. B. Mittwoch 01:00 für die Nacht von Dienstag auf Mittwoch.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="format">Format</Label>
        <select id="format" name="format" required defaultValue="" className={selectClass}>
          <option value="" disabled>
            Bitte wählen …
          </option>
          {(Object.keys(SCRIM_FORMAT_LABELS) as ScrimFormat[]).map((format) => (
            <option key={format} value={format}>
              {SCRIM_FORMAT_LABELS[format]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["rankMin", "rankMax"] as const).map((name) => (
          <div key={name} className="flex flex-col gap-1.5">
            <Label htmlFor={name}>{name === "rankMin" ? "Rang von" : "Rang bis"}</Label>
            <select
              id={name}
              name={name}
              required
              defaultValue={defaultRank}
              className={selectClass}
            >
              {RANKS.map((rank) => (
                <option key={rank} value={rank}>
                  {RANK_LABELS[rank]}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Maps (optional)</legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {MAP_POOL.map((map) => (
            <label key={map} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="maps" value={map} />
              {map}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note">Notiz (optional)</Label>
        <Textarea id="note" name="note" maxLength={REQUEST_NOTE_MAX} rows={3} />
      </div>
    </ActionForm>
  );
}
