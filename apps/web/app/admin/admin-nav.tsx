import { getBotStatus } from "@uni-scrims/core";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { missingLegalPages } from "@/lib/legal";

const BOT_LOOP_LABELS = [
  { loop: "sweeper", label: "Zeitsteuerung (Reminder, Fristen)" },
  { loop: "outbox", label: "Versand der Nachrichten" },
] as const;

const LINKS = [
  { href: "/admin", label: "Prüf-Queue" },
  { href: "/admin/disputes", label: "Streitfälle" },
  { href: "/admin/bans", label: "Sperren" },
  { href: "/admin/notifications", label: "Fehlgeschlagene Nachrichten" },
];

/**
 * Sub-navigation with the bot status (SPEC P0-9). Rendered by every admin page rather than the
 * layout, because layouts keep their output on client navigation and the status would go stale.
 */
export async function AdminNav({ adminId }: { adminId: string }) {
  const bot = await getBotStatus(adminId, new Date());
  const missingLegal = await missingLegalPages();
  const lastSeen = (heartbeatAt: Date | null) =>
    heartbeatAt
      ? `letztes Lebenszeichen ${formatDateTime(heartbeatAt)}`
      : "noch kein Lebenszeichen";
  return (
    <div className="flex flex-col gap-2">
      <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="underline">
            {link.label}
          </Link>
        ))}
      </nav>
      {missingLegal.length > 0 ? (
        <p className="text-sm text-destructive">
          Rechtstexte fehlen in LEGAL_DIR ({missingLegal.map((page) => `${page}.txt`).join(", ")}
          ): Die Seiten zeigen nur „Inhalt folgt.“
        </p>
      ) : null}
      {bot.online ? (
        <p className="text-sm">Bot läuft ({lastSeen(bot.loops.sweeper.heartbeatAt)})</p>
      ) : (
        <div className="text-sm text-destructive">
          <p>Bot offline</p>
          {BOT_LOOP_LABELS.map(({ loop, label }) => (
            <p key={loop}>
              {label}: {bot.loops[loop].online ? "läuft" : "steht"} (
              {lastSeen(bot.loops[loop].heartbeatAt)})
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
