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
import { RankIcon } from "@/components/rank-icon";
import { ToggleOption } from "@/components/toggle-option";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { requirePageUser } from "@/lib/session";
import { createRequestAction } from "../actions";
import { getLocale, getMessages, getText } from "@/lib/locale";
import { newRequestMessages, scrimSharedMessages } from "@/i18n/scrims";

/** Where each reason can be fixed; a ban is final, so it gets no link. */
function problemLinks(
  t: (typeof newRequestMessages)["de"],
): Partial<Record<ProblemKind, { href: string; label: string }>> {
  return {
    NOT_CAPTAIN: { href: "/team", label: t.problemLinks.notCaptain },
    CAPTAIN_NOT_VERIFIED: { href: "/verify", label: t.problemLinks.captainNotVerified },
    REQUEST_LIMIT: { href: "/scrims?tab=anfragen", label: t.problemLinks.requestLimit },
  };
}

export default async function NewRequestPage() {
  const user = await requirePageUser("/requests/new");
  const form = await getRequestForm({ userId: user.id, now: new Date() });
  const text = await getText();
  const t = await getMessages(newRequestMessages);
  const shared = await getMessages(scrimSharedMessages);
  const links = problemLinks(t);

  return (
    <PageMain className="gap-7">
      <BackLink href="/scrims">{shared.backToBoard}</BackLink>
      <div className="flex flex-col gap-2.5">
        <h1 className="type-h1">{t.title}</h1>
        <p className="text-pretty text-muted-foreground">
          {form ? t.forTeam(form.teamName) : null}
          {t.intro}
        </p>
      </div>
      {!form ? (
        <Alert>
          <span>
            {shared.noTeam((label) => (
              <Link href="/team" className="font-semibold underline underline-offset-2">
                {label}
              </Link>
            ))}
          </span>
        </Alert>
      ) : form.problems.length > 0 ? (
        // The reasons core's createRequest would reject with (§7), shown before the form.
        <div className="flex flex-col gap-2.5">
          {form.problems.map(({ kind, text: problem }) => {
            const link = links[kind];
            return (
              <Alert key={kind}>
                <span>
                  {text(problem)}
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
        <RequestForm teamId={form.teamId} range={form.rankRange} />
      )}
    </PageMain>
  );
}

/** The range starts where core says: the team rank, without one Iron to Radiant (SPEC N-16). */
async function RequestForm({
  teamId,
  range,
}: {
  teamId: string;
  range: { rankMin: Rank; rankMax: Rank };
}) {
  const locale = await getLocale();
  const t = await getMessages(newRequestMessages);
  const shared = await getMessages(scrimSharedMessages);
  const rankOptions = RANKS.map((rank) => ({
    value: rank,
    label: RANK_LABELS[rank],
    icon: <RankIcon rank={rank} />,
  }));
  return (
    <ActionForm
      action={createRequestAction}
      submitLabel={t.publish}
      size="lg"
      submitClassName="mt-1.5 w-full"
      className="flex flex-col gap-[22px]"
      footer={
        <Link href="/scrims" className={buttonVariants({ variant: "ghost", className: "mt-0.5" })}>
          {t.cancel}
        </Link>
      }
    >
      {/* The team the form was shown for, so a switch in another tab changes nothing (§5.20). */}
      <input type="hidden" name="teamId" value={teamId} />
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label={shared.date}>
            <DatePicker name="date" required min={toBerlinDateString(new Date())} />
          </Field>
          <Field label={shared.time}>
            <Select
              name="time"
              required
              defaultValue="20:00"
              options={START_TIME_SLOTS.map((slot) => ({ value: slot, label: t.timeOption(slot) }))}
            />
          </Field>
        </div>
        <p className="text-[13px] text-pretty text-muted-foreground">{t.timeHint}</p>
      </div>
      {/* Empty = a single request; without JavaScript it stays empty (SPEC N-25). */}
      <div className="flex flex-col gap-2">
        <Field label={t.repeatUntil}>
          <DatePicker
            name="repeatUntil"
            placeholder={t.repeatNever}
            clearable
            min={toBerlinDateString(new Date())}
          />
        </Field>
        <p className="text-[13px] text-pretty text-muted-foreground">{t.repeatHint}</p>
      </div>
      <Field label={shared.format}>
        <Select
          name="format"
          required
          defaultValue={null}
          placeholder={t.pleaseChoose}
          options={(Object.keys(SCRIM_FORMAT_LABELS[locale]) as ScrimFormat[]).map((format) => ({
            value: format,
            label: SCRIM_FORMAT_LABELS[locale][format],
          }))}
        />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 flex w-full justify-between text-[14px] font-medium">
          {shared.maps}
          <span className="font-normal text-faint">{t.mapsHint}</span>
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MAP_POOL.map((map) => (
            <ToggleOption
              key={map}
              type="checkbox"
              name="maps"
              value={map}
              label={map}
              className="min-h-11"
            />
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-2">
        <span className="text-[14px] font-medium">{t.rankRange}</span>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5">
          <Select
            name="rankMin"
            aria-label={t.rankFrom}
            required
            defaultValue={range.rankMin}
            options={rankOptions}
          />
          <span className="text-faint">{t.to}</span>
          <Select
            name="rankMax"
            aria-label={t.rankTo}
            required
            defaultValue={range.rankMax}
            options={rankOptions}
          />
        </div>
      </div>
      <CountedTextarea
        label={t.note}
        name="note"
        maxLength={REQUEST_NOTE_MAX}
        rows={3}
        placeholder={t.notePlaceholder}
      />
    </ActionForm>
  );
}
