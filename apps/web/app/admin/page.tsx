import { StatTile } from "@/components/stat-tile";
import { adminHref } from "@/lib/admin-url";
import { formatDateTime } from "@/lib/format";
import { requireAdminShellPage } from "@/lib/session";
import { AdminShell } from "./admin-shell";

const BOT_LOOPS = [
  { loop: "sweeper", label: "Zeitsteuerung" },
  { loop: "outbox", label: "Versand" },
] as const;

const lastSeen = (heartbeatAt: Date | null) =>
  heartbeatAt ? `zuletzt ${formatDateTime(heartbeatAt)} Uhr` : "noch kein Lebenszeichen";

/** Start page of the admin area (SPEC N-10): what waits, by role. */
export default async function AdminOverviewPage() {
  const { overview } = await requireAdminShellPage("/", "queue");
  const { queue, disputes, failedNotifications, bot } = overview;

  return (
    <AdminShell overview={overview} current="/">
      <h1 className="type-h1">Übersicht</h1>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          href={adminHref("/queue")}
          label="Offene Prüfungen"
          value={queue.pending}
          tone={queue.pending > 0 ? "text-warning" : undefined}
        >
          {queue.oldestAt
            ? `Älteste wartet seit ${formatDateTime(queue.oldestAt)} Uhr`
            : "Nichts zu prüfen"}
        </StatTile>
        {/* core returns null where the role does not see an area (§5.14). */}
        {disputes !== null ? (
          <StatTile
            href={adminHref("/disputes")}
            label="Streitfälle"
            value={disputes}
            tone={disputes ? "text-accent-text" : undefined}
          >
            {disputes ? "Warten auf eine Entscheidung" : "Keine offenen Streitfälle"}
          </StatTile>
        ) : null}
        {failedNotifications !== null ? (
          <StatTile
            href={adminHref("/notifications")}
            label="Nachrichten"
            value={failedNotifications}
            tone={failedNotifications ? "text-accent-text" : undefined}
          >
            {failedNotifications ? "Fehlgeschlagen, nicht zugestellt" : "Keine fehlgeschlagen"}
          </StatTile>
        ) : null}
        {bot ? (
          // Display only: the bot has no page of its own.
          <StatTile
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
          </StatTile>
        ) : null}
      </div>
    </AdminShell>
  );
}
