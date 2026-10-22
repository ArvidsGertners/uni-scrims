import { getBotStatus } from "@uni-scrims/core";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";

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
  const lastSeen = bot.heartbeatAt
    ? `letztes Lebenszeichen ${formatDateTime(bot.heartbeatAt)}`
    : null;
  return (
    <div className="flex flex-col gap-2">
      <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="underline">
            {link.label}
          </Link>
        ))}
      </nav>
      <p className={bot.online ? "text-sm" : "text-sm text-destructive"}>
        {bot.online ? "Bot läuft" : "Bot offline"} ({lastSeen ?? "noch kein Lebenszeichen"})
      </p>
    </div>
  );
}
