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
import { MAP_POOL, type ValorantMap } from "@uni-scrims/core/config/maps";
import { type Rank, ScrimFormat } from "@uni-scrims/db";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { BackLink } from "@/components/back-link";
import { CountedTextarea } from "@/components/counted-textarea";
import { FullyVerifiedBadge } from "@/components/fully-verified-badge";
import { PageMain } from "@/components/page-main";
import { RankIcon, RankLabel } from "@/components/rank-icon";
import { ReliabilityLine } from "@/components/reliability-line";
import { TeamAvatar } from "@/components/team-avatar";
import { ToggleOption } from "@/components/toggle-option";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { formatUniversities } from "@/lib/scrim-format";
import { list, single, toQueryString } from "@/lib/search-params";
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

/** What "Nochmal gegen dieses Team" fills in (SPEC N-26); invalid values are left out. */
type FormDefaults = { format: ScrimFormat | null; maps: ValorantMap[]; time: string | null };

function readDefaults(params: Record<string, string | string[] | undefined>): FormDefaults {
  const format = single(params.format);
  const time = single(params.time);
  return {
    format: Object.values(ScrimFormat).find((value) => value === format) ?? null,
    maps: MAP_POOL.filter((map) => list(params.maps).includes(map)),
    time: time && START_TIME_SLOTS.includes(time) ? time : null,
  };
}

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await requirePageUser(`/requests/new${toQueryString(params)}`);
  // ?team=<id>: a direct request to that team (SPEC N-26).
  const targetTeamId = single(params.team) ?? null;
  const form = await getRequestForm({ userId: user.id, now: new Date(), targetTeamId });
  const text = await getText();
  const locale = await getLocale();
  const t = await getMessages(newRequestMessages);
  const shared = await getMessages(scrimSharedMessages);
  const links = problemLinks(t);
  const target = form?.target?.team ?? null;

  return (
    <PageMain className="gap-7">
      <BackLink href="/scrims">{shared.backToBoard}</BackLink>
      <div className="flex flex-col gap-2.5">
        <h1 className="type-h1">{targetTeamId ? t.directTitle : t.title}</h1>
        <p className="text-pretty text-muted-foreground">
          {form ? t.forTeam(form.teamName) : null}
          {target ? t.directIntro(target.name) : targetTeamId ? null : t.intro}
        </p>
      </div>
      {target ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
          <TeamAvatar team={target} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="type-label text-muted-foreground">{t.directTo}</span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="min-w-0 font-semibold break-words">
                {target.name}{" "}
                <span className="font-label text-[13px] text-faint">{target.tag}</span>
              </span>
              {target.fullyVerified ? <FullyVerifiedBadge /> : null}
            </span>
            <span className="text-[13px] text-pretty text-muted-foreground">
              {formatUniversities(target.universities, locale)} · {shared.teamRank}{" "}
              <RankLabel rank={target.rank} />
            </span>
            <ReliabilityLine reliability={target.reliability} />
          </div>
        </div>
      ) : null}
      {form?.target?.problem ? (
        <Alert>
          <span>
            {text(form.target.problem)}{" "}
            <Link href="/teams" className="font-semibold underline underline-offset-2">
              {t.toTeamsList}
            </Link>
          </span>
        </Alert>
      ) : !form ? (
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
        <RequestForm
          teamId={form.teamId}
          range={form.rankRange}
          target={target}
          defaults={readDefaults(params)}
        />
      )}
    </PageMain>
  );
}

/**
 * The range starts where core says: the team rank, without one Iron to Radiant (SPEC N-16). A direct
 * request has no range; its weekly repeat proposes a fixed partnership (SPEC N-26).
 */
async function RequestForm({
  teamId,
  range,
  target,
  defaults,
}: {
  teamId: string;
  range: { rankMin: Rank; rankMax: Rank };
  target: { id: string; name: string } | null;
  defaults: FormDefaults;
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
      submitLabel={target ? t.sendDirect : t.publish}
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
      {target ? (
        <>
          <input type="hidden" name="targetTeamId" value={target.id} />
          {/* Only for the toast text. */}
          <input type="hidden" name="targetTeamName" value={target.name} />
        </>
      ) : null}
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label={shared.date}>
            <DatePicker name="date" required min={toBerlinDateString(new Date())} />
          </Field>
          <Field label={shared.time}>
            <Select
              name="time"
              required
              defaultValue={defaults.time ?? "20:00"}
              options={START_TIME_SLOTS.map((slot) => ({ value: slot, label: t.timeOption(slot) }))}
            />
          </Field>
        </div>
        <p className="text-[13px] text-pretty text-muted-foreground">{t.timeHint}</p>
      </div>
      {/* Empty = a single request; without JavaScript it stays empty (SPEC N-25). */}
      <div className="flex flex-col gap-2">
        <Field label={target ? t.weeklyUntil : t.repeatUntil}>
          <DatePicker
            name="repeatUntil"
            placeholder={t.repeatNever}
            clearable
            min={toBerlinDateString(new Date())}
          />
        </Field>
        <p className="text-[13px] text-pretty text-muted-foreground">
          {target ? t.weeklyHint(target.name) : t.repeatHint}
        </p>
      </div>
      <Field label={shared.format}>
        <Select
          name="format"
          required
          defaultValue={defaults.format}
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
              defaultChecked={defaults.maps.includes(map)}
              className="min-h-11"
            />
          ))}
        </div>
      </fieldset>
      {target ? null : (
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
      )}
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
