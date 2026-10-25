import { MAX_FAILED_SHOWN, listFailedNotifications } from "@uni-scrims/core";
import { LIST_COLUMNS } from "@/components/list-group";
import { formatDateTime } from "@/lib/format";
import { NOTIFICATION_CHANNEL_LABELS, NOTIFICATION_TYPE_LABELS } from "@/lib/scrim-format";
import { requireAdminShellPage } from "@/lib/session";
import { AdminShell } from "../admin-shell";
import { getLocale, getMessages } from "@/lib/locale";
import { adminNotificationsMessages } from "@/i18n/admin";

export default async function FailedNotificationsPage() {
  const { staff: admin, overview } = await requireAdminShellPage("/notifications", "admin");
  const { entries: failed, total } = await listFailedNotifications(admin.id);
  const locale = await getLocale();
  const t = await getMessages(adminNotificationsMessages);

  return (
    <AdminShell overview={overview} current="/notifications">
      <h1 className="type-h1">{t.title}</h1>
      <p className="max-w-3xl text-[14px] text-muted-foreground">{t.intro(MAX_FAILED_SHOWN)}</p>
      {failed.length === 0 ? <p>{t.empty}</p> : null}
      {total > failed.length ? (
        <p className="text-[14px]">{t.hidden(total - failed.length)}</p>
      ) : null}
      <ul className={`${LIST_COLUMNS} gap-3`}>
        {failed.map((entry) => (
          <li
            key={entry.id}
            className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4 text-[14px]"
          >
            <p className="font-medium">
              {NOTIFICATION_TYPE_LABELS[locale][entry.type]} ·{" "}
              {NOTIFICATION_CHANNEL_LABELS[locale][entry.channel]}
            </p>
            <p>
              {t.details(
                entry.targetName ?? t.unknownTarget,
                formatDateTime(entry.createdAt, locale),
                formatDateTime(entry.scheduledFor, locale),
                entry.attempts,
              )}
            </p>
            {entry.lastError ? (
              <p className="font-mono text-[13px] break-all text-muted-foreground">
                {entry.lastError}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </AdminShell>
  );
}
