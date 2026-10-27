import {
  type ProblemKind,
  RANK_LABELS,
  RANKS,
  SCRIM_FORMAT_LABELS,
  getReadyWindowForm,
  toBerlinTimeString,
} from "@uni-scrims/core";
import { MAP_POOL } from "@uni-scrims/core/config/maps";
import { TIMING } from "@uni-scrims/core/config/timing";
import type { Rank, ScrimFormat } from "@uni-scrims/db";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { DialogShell } from "@/components/dialog-shell";
import { RankIcon } from "@/components/rank-icon";
import { RouteDialogClose } from "@/components/route-dialog";
import { ToggleOption } from "@/components/toggle-option";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { requirePageUser } from "@/lib/session";
import { getLocale, getMessages, getText } from "@/lib/locale";
import { createReadyWindowAction } from "../requests/actions";
import { newRequestMessages, readyFormMessages, scrimSharedMessages } from "@/i18n/scrims";

/** The default window: from 19:00 (or the first start left) for three hours. */
const DEFAULT_FROM = "19:00";
const DEFAULT_SLOTS = 12;

/**
 * "Heute spielbereit melden" (SPEC N-27, §5.29): the start times of this evening come from core;
 * instead of the form the reasons createReadyWindow would reject with, a running window or that no
 * start time is left. As a dialog over the current page, loaded directly over the board (SPEC N-31).
 */
export async function ReadyDialog({ intercepted }: { intercepted: boolean }) {
  const user = await requirePageUser("/ready");
  const form = await getReadyWindowForm({ userId: user.id, now: new Date() });
  const text = await getText();
  const t = await getMessages(readyFormMessages);
  const request = await getMessages(newRequestMessages);
  const shared = await getMessages(scrimSharedMessages);
  const links: Partial<Record<ProblemKind, { href: string; label: string }>> = {
    NOT_CAPTAIN: { href: "/team", label: request.problemLinks.notCaptain },
    CAPTAIN_NOT_VERIFIED: { href: "/verify", label: request.problemLinks.captainNotVerified },
  };
  const toBoard = (
    <Link href="/scrims" className="font-semibold underline underline-offset-2">
      {t.toBoard}
    </Link>
  );

  return (
    <DialogShell title={t.title} fallback="/scrims" intercepted={intercepted}>
      <p className="-mt-2 text-pretty text-muted-foreground">
        {form ? request.forTeam(form.teamName) : null}
        {t.intro}
      </p>
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
      ) : form.running ? (
        <Alert>
          <span>
            {t.running(
              toBerlinTimeString(form.running.firstStartsAt),
              toBerlinTimeString(form.running.lastStartsAt),
            )}{" "}
            {toBoard}
          </span>
        </Alert>
      ) : form.starts.length === 0 ? (
        <Alert>
          <span>
            {t.noStartsLeft} {toBoard}
          </span>
        </Alert>
      ) : (
        <ReadyForm
          teamId={form.teamId}
          evening={form.evening}
          times={form.starts.map(toBerlinTimeString)}
          range={form.rankRange}
        />
      )}
    </DialogShell>
  );
}

/** The start times as "HH:MM" of this evening in order, as createReadyWindow takes them. */
async function ReadyForm({
  teamId,
  evening,
  times,
  range,
}: {
  teamId: string;
  evening: string;
  times: string[];
  range: { rankMin: Rank; rankMax: Rank };
}) {
  const locale = await getLocale();
  const t = await getMessages(readyFormMessages);
  const request = await getMessages(newRequestMessages);
  const shared = await getMessages(scrimSharedMessages);
  const fromIndex = Math.max(times.indexOf(DEFAULT_FROM), 0);
  const toIndex = Math.min(fromIndex + DEFAULT_SLOTS, times.length - 1);
  const timeOptions = times.map((time) => ({ value: time, label: request.timeOption(time) }));
  const rankOptions = RANKS.map((rank) => ({
    value: rank,
    label: RANK_LABELS[rank],
    icon: <RankIcon rank={rank} />,
  }));
  return (
    <ActionForm
      action={createReadyWindowAction}
      submitLabel={t.submit}
      size="lg"
      submitClassName="mt-1.5 w-full"
      className="flex flex-col gap-[22px]"
      creates
      footer={<RouteDialogClose className="mt-0.5">{request.cancel}</RouteDialogClose>}
    >
      {/* The team the form was shown for, so a switch in another tab changes nothing (§5.20). */}
      <input type="hidden" name="teamId" value={teamId} />
      {/* The evening of the times: sent after 02:00 they would name the next one (§5.29). */}
      <input type="hidden" name="evening" value={evening} />
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.from}>
            <Select name="from" required defaultValue={times[fromIndex]} options={timeOptions} />
          </Field>
          <Field label={t.to}>
            <Select name="to" required defaultValue={times[toIndex]} options={timeOptions} />
          </Field>
        </div>
        <p className="text-[13px] text-pretty text-muted-foreground">
          {t.timeHint(Math.round(TIMING.MIN_REQUEST_LEAD / 60_000))}
        </p>
      </div>
      <Field label={shared.format}>
        <Select
          name="format"
          required
          placeholder={request.pleaseChoose}
          options={(Object.keys(SCRIM_FORMAT_LABELS[locale]) as ScrimFormat[]).map((format) => ({
            value: format,
            label: SCRIM_FORMAT_LABELS[locale][format],
          }))}
        />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 flex w-full justify-between text-[14px] font-medium">
          {shared.maps}
          <span className="font-normal text-faint">{request.mapsHint}</span>
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
        <span className="text-[14px] font-medium">{request.rankRange}</span>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5">
          <Select
            name="rankMin"
            aria-label={request.rankFrom}
            required
            defaultValue={range.rankMin}
            options={rankOptions}
          />
          <span className="text-faint">{request.to}</span>
          <Select
            name="rankMax"
            aria-label={request.rankTo}
            required
            defaultValue={range.rankMax}
            options={rankOptions}
          />
        </div>
      </div>
    </ActionForm>
  );
}
