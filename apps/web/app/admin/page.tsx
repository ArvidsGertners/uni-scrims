import { StatTile } from "@/components/stat-tile";
import { adminHref } from "@/lib/admin-url";
import { formatDateTime } from "@/lib/format";
import { requireAdminShellPage } from "@/lib/session";
import { AdminShell } from "./admin-shell";
import { getLocale, getMessages } from "@/lib/locale";
import { adminOverviewMessages } from "@/i18n/admin";

const BOT_LOOPS = ["sweeper", "outbox"] as const;

/** Start page of the admin area (SPEC N-10): what waits, by role. */
export default async function AdminOverviewPage() {
  const { overview } = await requireAdminShellPage("/", "queue");
  const { queue, disputes, failedNotifications, bot, teamLimitRequests } = overview;
  const locale = await getLocale();
  const t = await getMessages(adminOverviewMessages);
  const lastSeen = (heartbeatAt: Date | null) =>
    heartbeatAt ? t.lastSeen(formatDateTime(heartbeatAt, locale, { suffix: true })) : t.noHeartbeat;

  return (
    <AdminShell overview={overview} current="/">
      <h1 className="type-h1">{t.title}</h1>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          href={adminHref("/queue")}
          label={t.openReviews}
          value={queue.pending}
          tone={queue.pending > 0 ? "text-warning" : undefined}
        >
          {queue.oldestAt
            ? t.oldestWaiting(formatDateTime(queue.oldestAt, locale, { suffix: true }))
            : t.nothingToReview}
        </StatTile>
        {/* core returns null where the role does not see an area (§5.14). */}
        {disputes !== null ? (
          <StatTile
            href={adminHref("/disputes")}
            label={t.disputes}
            value={disputes}
            tone={disputes ? "text-destructive-text" : undefined}
          >
            {disputes ? t.disputesWaiting : t.noDisputes}
          </StatTile>
        ) : null}
        {teamLimitRequests !== null ? (
          <StatTile
            href={adminHref("/team-limits")}
            label={t.teamRequests}
            value={teamLimitRequests}
            tone={teamLimitRequests ? "text-warning" : undefined}
          >
            {teamLimitRequests ? t.moreTeamsRequested : t.noTeamRequests}
          </StatTile>
        ) : null}
        {failedNotifications !== null ? (
          <StatTile
            href={adminHref("/notifications")}
            label={t.messages}
            value={failedNotifications}
            tone={failedNotifications ? "text-destructive-text" : undefined}
          >
            {failedNotifications ? t.messagesFailed : t.noneFailed}
          </StatTile>
        ) : null}
        {bot ? (
          // Display only: the bot has no page of its own.
          <StatTile
            label={t.bot}
            value={bot.online ? t.botRunning : t.botOffline}
            tone={bot.online ? "text-success" : "text-destructive-text"}
          >
            {BOT_LOOPS.map((loop) => (
              <span key={loop} className="block">
                {t.loopStatus(
                  t.loops[loop],
                  bot.loops[loop].online,
                  lastSeen(bot.loops[loop].heartbeatAt),
                )}
              </span>
            ))}
          </StatTile>
        ) : null}
      </div>
    </AdminShell>
  );
}
