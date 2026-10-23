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
import { BackLink } from "@/components/back-link";
import { CountedTextarea } from "@/components/counted-textarea";
import { PageMain } from "@/components/page-main";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
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

  return (
    <PageMain className="gap-7">
      <BackLink href="/board">Zurück zum Board</BackLink>
      <div className="flex flex-col gap-2.5">
        <h1 className="type-h1">Scrim-Anfrage erstellen</h1>
        <p className="text-pretty text-muted-foreground">
          Deine Anfrage erscheint sofort auf dem Board. Ihr entscheidet, welches Team ihr annehmt.
        </p>
      </div>
      {!form ? (
        <Alert>
          <span>
            Du bist in keinem Team.{" "}
            <Link href="/team" className="font-semibold underline underline-offset-2">
              Team gründen oder beitreten
            </Link>
          </span>
        </Alert>
      ) : form.problems.length > 0 ? (
        // The reasons core's createRequest would reject with (§7), shown before the form.
        <div className="flex flex-col gap-2.5">
          {form.problems.map(({ kind, message }) => {
            const link = PROBLEM_LINKS[kind];
            return (
              <Alert key={kind}>
                <span>
                  {message}
                  {link ? (
                    <>
                      {" "}
                      <Link href={link.href} className="font-semibold underline underline-offset-2">
                        {link.label}
                      </Link>
                    </>
                  ) : null}
                </span>
              </Alert>
            );
          })}
        </div>
      ) : (
        <RequestForm defaultRank={form.rank} />
      )}
    </PageMain>
  );
}

function RequestForm({ defaultRank }: { defaultRank: Rank }) {
  return (
    <ActionForm
      action={createRequestAction}
      submitLabel="Anfrage veröffentlichen"
      size="lg"
      submitClassName="mt-1.5 w-full"
      className="flex flex-col gap-[22px]"
      footer={
        <Link href="/board" className={buttonVariants({ variant: "ghost", className: "mt-0.5" })}>
          Abbrechen
        </Link>
      }
    >
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Datum">
            <Input name="date" type="date" required min={toBerlinDateString(new Date())} />
          </Field>
          <Field label="Uhrzeit">
            <NativeSelect name="time" required defaultValue="20:00">
              {START_TIME_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {slot} Uhr
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <p className="text-[13px] text-pretty text-muted-foreground">
          Uhrzeiten in deutscher Zeit. Für Starts nach Mitternacht (00:00–01:45) das Datum des
          Folgetags wählen, z. B. Mittwoch 01:00 für die Nacht von Dienstag auf Mittwoch.
        </p>
      </div>
      <Field label="Format">
        <NativeSelect name="format" required defaultValue="">
          <option value="" disabled>
            Bitte wählen …
          </option>
          {(Object.keys(SCRIM_FORMAT_LABELS) as ScrimFormat[]).map((format) => (
            <option key={format} value={format}>
              {SCRIM_FORMAT_LABELS[format]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 flex w-full justify-between text-[14px] font-medium">
          Maps<span className="font-normal text-faint">optional · sonst freie Wahl</span>
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MAP_POOL.map((map) => (
            <label
              key={map}
              className="type-btn flex min-h-11 cursor-pointer items-center justify-center rounded-sm border border-border bg-card px-3 text-[15px] font-semibold text-muted-foreground hover:border-muted-foreground has-checked:border-primary has-checked:bg-accent-soft has-checked:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
            >
              <input type="checkbox" name="maps" value={map} className="sr-only" />
              {map}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-2">
        <span className="text-[14px] font-medium">Rangbereich</span>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5">
          <NativeSelect name="rankMin" aria-label="Rang von" required defaultValue={defaultRank}>
            {RANKS.map((rank) => (
              <option key={rank} value={rank}>
                {RANK_LABELS[rank]}
              </option>
            ))}
          </NativeSelect>
          <span className="text-faint">bis</span>
          <NativeSelect name="rankMax" aria-label="Rang bis" required defaultValue={defaultRank}>
            {RANKS.map((rank) => (
              <option key={rank} value={rank}>
                {RANK_LABELS[rank]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <CountedTextarea
        label="Notiz"
        name="note"
        maxLength={REQUEST_NOTE_MAX}
        rows={3}
        placeholder="Was sollten andere Teams wissen?"
      />
    </ActionForm>
  );
}
