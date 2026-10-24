import { getAdminOverview, staffArea } from "@uni-scrims/core";
import { cn } from "cn";
import Link from "next/link";
import type { ReactNode } from "react";
import { adminHref } from "@/lib/admin-url";
import { formatDateTime } from "@/lib/format";
import { requireStaffPage } from "@/lib/session";
import { AdminShell } from "./admin-shell";

const BOT_LOOPS = [
  { loop: "sweeper", label: "Zeitsteuerung" },
  { loop: "outbox", label: "Versand" },
] as const;

const tileClass = "flex flex-col gap-1.5 rounded-lg border border-border bg-card p-5";

function Tile({
  href,
  label,
  value,
  children,
  tone,
}: {
  href?: string;
  label: string;
  value: ReactNode;
  children: ReactNode;
  tone?: string;
}) {
  const content = (
    <>
      <span className="type-label text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-display text-[36px] leading-tight [font-weight:var(--display-weight)]",
          tone,
        )}
      >
        {value}
      </span>
      <span className="text-[13px] text-pretty text-muted-foreground">{children}</span>
    </>
  );
  return href ? (
    <Link href={href} className={cn(tileClass, "hover:border-border-strong hover:bg-secondary")}>
      {content}
    </Link>
  ) : (
    <div className={tileClass}>{content}</div>
  );
}

const lastSeen = (heartbeatAt: Date | null) =>
  heartbeatAt ? `zuletzt ${formatDateTime(heartbeatAt)} Uhr` : "noch kein Lebenszeichen";

/** Start page of the admin area (SPEC N-10): what waits, by role. */
export default async function AdminOverviewPage() {
  const staff = await requireStaffPage("/", "queue");
  const overview = await getAdminOverview({ staffId: staff.id, now: new Date() });
  const { queue, bot } = overview;

  return (
    <AdminShell overview={overview} current="/">
      <h1 className="type-h1">Übersicht</h1>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          href={adminHref("/queue")}
          label="Offene Prüfungen"
          value={queue.pending}
          tone={queue.pending > 0 ? "text-warning" : undefined}
        >
          {queue.oldestAt
            ? `Älteste wartet seit ${formatDateTime(queue.oldestAt)} Uhr`
            : "Nichts zu prüfen"}
        </Tile>
        {staffArea(overview.viewer.staffRole, "admin") ? (
          <>
            <Tile
              href={adminHref("/disputes")}
              label="Streitfälle"
              value={overview.disputes}
              tone={overview.disputes ? "text-accent-text" : undefined}
            >
              {overview.disputes ? "Warten auf eine Entscheidung" : "Keine offenen Streitfälle"}
            </Tile>
            <Tile
              href={adminHref("/notifications")}
              label="Nachrichten"
              value={overview.failedNotifications}
              tone={overview.failedNotifications ? "text-accent-text" : undefined}
            >
              {overview.failedNotifications
                ? "Fehlgeschlagen, nicht zugestellt"
                : "Keine fehlgeschlagen"}
            </Tile>
            {bot ? (
              <Tile
                label="Bot"
                value={bot.online ? "Läuft" : "Offline"}
                tone={bot.online ? "text-success" : "text-accent-text"}
              >
                {BOT_LOOPS.map(({ loop, label }) => (
                  <span key={loop} className="block">
                    {label}: {bot.loops[loop].online ? "läuft" : "steht"},{" "}
                    {lastSeen(bot.loops[loop].heartbeatAt)}
                  </span>
                ))}
              </Tile>
            ) : null}
          </>
        ) : null}
      </div>
    </AdminShell>
  );
}
