import {
  METRIC_TEXTS,
  type MetricResult,
  STATS_WINDOW_DAYS,
  type SuccessMetric,
  getSuccessMetrics,
} from "@uni-scrims/core";
import { LIST_COLUMNS } from "@/components/list-group";
import { Badge } from "@/components/ui/badge";
import { formatCases, formatMetricValue, formatThreshold } from "@/lib/metric-format";
import { requireAdminShellPage } from "@/lib/session";
import { AdminShell } from "../admin-shell";
import { getLocale, getMessages } from "@/lib/locale";
import { adminStatsMessages } from "@/i18n/admin";

const GROUPS = ["early", "late"] as const;

async function Status({ result }: { result: MetricResult }) {
  if (result.reached === null) return null;
  const t = await getMessages(adminStatsMessages);
  if (result.stretchReached) return <Badge variant="success">{t.stretchReached}</Badge>;
  if (result.reached) return <Badge variant="success">{t.targetReached}</Badge>;
  return <Badge variant="warning">{t.targetMissed}</Badge>;
}

async function ResultRow({
  label,
  metric,
  result,
}: {
  label: string;
  metric: SuccessMetric;
  result: MetricResult;
}) {
  const locale = await getLocale();
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <span className="text-[13px] text-muted-foreground sm:w-32 sm:shrink-0">{label}</span>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-display text-[22px] leading-none [font-weight:var(--display-weight)]">
          {result.value === null ? "–" : formatMetricValue(metric.unit, result.value, locale)}
        </span>
        <span className="text-[13px] text-muted-foreground">
          {formatCases(metric.key, result, locale)}
        </span>
        <Status result={result} />
      </div>
    </div>
  );
}

async function MetricCard({ metric }: { metric: SuccessMetric }) {
  const locale = await getLocale();
  const t = await getMessages(adminStatsMessages);
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-[14px]">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold">{METRIC_TEXTS[locale][metric.key].label}</h3>
        <p className="text-[13px] text-pretty text-muted-foreground">
          {METRIC_TEXTS[locale][metric.key].description}
        </p>
        <p className="text-[13px]">
          {t.target(formatThreshold(metric.unit, metric.goal, metric.target, locale))}
          {metric.stretch === null
            ? null
            : ` · ${t.stretch(formatThreshold(metric.unit, metric.goal, metric.stretch, locale))}`}
        </p>
      </div>
      {metric.snapshot ? (
        <ResultRow label={t.current} metric={metric} result={metric.now} />
      ) : (
        <>
          <ResultRow
            label={t.lastDays(STATS_WINDOW_DAYS)}
            metric={metric}
            result={metric.last28Days}
          />
          <ResultRow label={t.total} metric={metric} result={metric.total} />
        </>
      )}
    </li>
  );
}

/** Success metrics of SPEC §8 (SPEC N-2); only sums, no personal data. */
export default async function StatsPage() {
  const { staff: admin, overview } = await requireAdminShellPage("/stats", "admin");
  const metrics = await getSuccessMetrics({ adminId: admin.id, now: new Date() });
  const t = await getMessages(adminStatsMessages);

  return (
    <AdminShell overview={overview} current="/stats">
      <h1 className="type-h1">{t.title}</h1>
      <p className="max-w-3xl text-[14px] text-pretty text-muted-foreground">{t.intro}</p>
      {GROUPS.map((group) => (
        <section key={group} className="flex flex-col gap-3">
          <h2 className="type-h2">
            {t.groups[group].title}{" "}
            <span className="text-[14px] font-normal text-muted-foreground">
              {t.groups[group].hint}
            </span>
          </h2>
          <ul className={`${LIST_COLUMNS} gap-3`}>
            {metrics
              .filter((metric) => metric.group === group)
              .map((metric) => (
                <MetricCard key={metric.key} metric={metric} />
              ))}
          </ul>
        </section>
      ))}
    </AdminShell>
  );
}
