import { MAX_FAILED_SHOWN, listFailedNotifications } from "@uni-scrims/core";
import { formatDateTime } from "@/lib/format";
import { NOTIFICATION_CHANNEL_LABELS, NOTIFICATION_TYPE_LABELS } from "@/lib/scrim-format";
import { requireAdminShellPage } from "@/lib/session";
import { AdminShell } from "../admin-shell";

export default async function FailedNotificationsPage() {
  const { staff: admin, overview } = await requireAdminShellPage("/notifications", "admin");
  const { entries: failed, total } = await listFailedNotifications(admin.id);

  return (
    <AdminShell overview={overview} current="/notifications">
      <h1 className="type-h1">Fehlgeschlagene Nachrichten</h1>
      <p className="text-[14px] text-muted-foreground">
        Nachrichten, die dauerhaft nicht zugestellt werden konnten, zuletzt fehlgeschlagene zuerst
        (höchstens {MAX_FAILED_SHOWN}). 30 Tage nach dem letzten Versuch werden sie gelöscht.
      </p>
      {failed.length === 0 ? <p>Keine fehlgeschlagenen Nachrichten.</p> : null}
      {total > failed.length ? (
        <p className="text-[14px]">
          {total - failed.length} ältere fehlgeschlagene Nachrichten werden nicht angezeigt.
        </p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {failed.map((entry) => (
          <li
            key={entry.id}
            className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4 text-[14px]"
          >
            <p className="font-medium">
              {NOTIFICATION_TYPE_LABELS[entry.type]} · {NOTIFICATION_CHANNEL_LABELS[entry.channel]}
            </p>
            <p>
              An: {entry.targetName ?? "unbekannt"} · erstellt {formatDateTime(entry.createdAt)} ·
              letzter Versuch {formatDateTime(entry.scheduledFor)} · {entry.attempts} Fehlversuche
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
