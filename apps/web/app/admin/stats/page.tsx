import {
  type MetricResult,
  STATS_WINDOW_DAYS,
  type SuccessMetric,
  getSuccessMetrics,
  getAdminOverview,
} from "@uni-scrims/core";
import { Badge } from "@/components/ui/badge";
import { formatCases, formatMetricValue, formatThreshold } from "@/lib/metric-format";
import { requireStaffPage } from "@/lib/session";
import { AdminShell } from "../admin-shell";

const GROUPS = [
  { group: "early", title: "Frühindikatoren", hint: "für die ersten 4 Wochen" },
  { group: "late", title: "Spätindikatoren", hint: "nach 2–3 Monaten" },
] as const;

function Status({ result }: { result: MetricResult }) {
  if (result.reached === null) return null;
  if (result.stretchReached) return <Badge variant="success">Stretch erreicht</Badge>;
  if (result.reached) return <Badge variant="success">Ziel erreicht</Badge>;
  return <Badge variant="warning">Ziel verfehlt</Badge>;
}

function ResultRow({
  label,
  metric,
  result,
}: {
  label: string;
  metric: SuccessMetric;
  result: MetricResult;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <span className="text-[13px] text-muted-foreground sm:w-32 sm:shrink-0">{label}</span>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-display text-[22px] leading-none [font-weight:var(--display-weight)]">
          {result.value === null ? "–" : formatMetricValue(metric.unit, result.value)}
        </span>
        <span className="text-[13px] text-muted-foreground">{formatCases(metric.key, result)}</span>
        <Status result={result} />
      </div>
    </div>
  );
}

function MetricCard({ metric }: { metric: SuccessMetric }) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-[14px]">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold">{metric.label}</h3>
        <p className="text-[13px] text-pretty text-muted-foreground">{metric.description}</p>
        <p className="text-[13px]">
          Ziel {formatThreshold(metric.unit, metric.goal, metric.target)}
          {metric.stretch === null
            ? null
            : ` · Stretch ${formatThreshold(metric.unit, metric.goal, metric.stretch)}`}
        </p>
      </div>
      {metric.snapshot ? (
        <ResultRow label="Aktuell" metric={metric} result={metric.now} />
      ) : (
        <>
          <ResultRow
            label={`Letzte ${STATS_WINDOW_DAYS} Tage`}
            metric={metric}
            result={metric.last28Days}
          />
          <ResultRow label="Gesamt" metric={metric} result={metric.total} />
        </>
      )}
    </li>
  );
}

/** Success metrics of SPEC §8 (SPEC N-2); only sums, no personal data. */
export default async function StatsPage() {
  const admin = await requireStaffPage("/stats", "admin");
  const overview = await getAdminOverview({ staffId: admin.id, now: new Date() });
  const metrics = await getSuccessMetrics({ adminId: admin.id, now: new Date() });

  return (
    <AdminShell overview={overview} current="/stats">
      <h1 className="type-h1">Statistik</h1>
      <p className="text-[14px] text-pretty text-muted-foreground">
        Die Erfolgskriterien aus der Spezifikation, jeweils bis jetzt. Prüfungen gelöschter Konten
        fehlen, weil sie mit dem Konto gelöscht werden.
      </p>
      {GROUPS.map(({ group, title, hint }) => (
        <section key={group} className="flex flex-col gap-3">
          <h2 className="type-h2">
            {title} <span className="text-[14px] font-normal text-muted-foreground">{hint}</span>
          </h2>
          <ul className="flex flex-col gap-3">
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
