import { MAX_FAILED_SHOWN, listFailedNotifications } from "@uni-scrims/core";
import { formatDateTime } from "@/lib/format";
import { NOTIFICATION_CHANNEL_LABELS, NOTIFICATION_TYPE_LABELS } from "@/lib/scrim-format";
import { requireAdminPage } from "@/lib/session";
import { AdminNav } from "../admin-nav";

export default async function FailedNotificationsPage() {
  const admin = await requireAdminPage("/admin/notifications");
  const { entries: failed, total } = await listFailedNotifications(admin.id);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <AdminNav adminId={admin.id} />
      <h1 className="text-2xl font-bold">Fehlgeschlagene Nachrichten</h1>
      <p className="text-sm opacity-80">
        Nachrichten, die dauerhaft nicht zugestellt werden konnten, zuletzt fehlgeschlagene zuerst
        (höchstens {MAX_FAILED_SHOWN}). 30 Tage nach dem letzten Versuch werden sie gelöscht.
      </p>
      {failed.length === 0 ? <p>Keine fehlgeschlagenen Nachrichten.</p> : null}
      {total > failed.length ? (
        <p className="text-sm">
          {total - failed.length} ältere fehlgeschlagene Nachrichten werden nicht angezeigt.
        </p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {failed.map((entry) => (
          <li key={entry.id} className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
            <p className="font-medium">
              {NOTIFICATION_TYPE_LABELS[entry.type]} · {NOTIFICATION_CHANNEL_LABELS[entry.channel]}
            </p>
            <p>
              An: {entry.targetName ?? "unbekannt"} · erstellt {formatDateTime(entry.createdAt)} ·
              letzter Versuch {formatDateTime(entry.scheduledFor)} · {entry.attempts} Fehlversuche
            </p>
            {entry.lastError ? (
              <p className="font-mono text-xs break-all opacity-70">{entry.lastError}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
