import { type StaffArea, getBotStatus, staffArea } from "@uni-scrims/core";
import type { StaffRole } from "@uni-scrims/db";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { missingLegalPages } from "@/lib/legal";

const BOT_LOOP_LABELS = [
  { loop: "sweeper", label: "Zeitsteuerung (Verfall, Feedback-Fristen, Aufräumen)" },
  { loop: "outbox", label: "Versand der Nachrichten (auch Reminder)" },
] as const;

const LINKS: { href: string; label: string; area: StaffArea }[] = [
  { href: "/admin", label: "Prüf-Queue", area: "queue" },
  { href: "/admin/disputes", label: "Streitfälle", area: "admin" },
  { href: "/admin/bans", label: "Sperren", area: "admin" },
  { href: "/admin/notifications", label: "Fehlgeschlagene Nachrichten", area: "admin" },
  { href: "/admin/stats", label: "Statistik", area: "admin" },
  { href: "/admin/staff", label: "Rollen", area: "staff" },
];

/**
 * Sub-navigation with the bot status (SPEC P0-9), showing only the areas of the role (§5.9).
 * Rendered by every admin page rather than the layout, because layouts keep their output on client
 * navigation and the status would go stale.
 */
export async function AdminNav({ staff }: { staff: { id: string; staffRole: StaffRole } }) {
  const links = LINKS.filter((link) => staffArea(staff.staffRole, link.area));
  // Bot status and the legal texts concern admins; reviewers only see their queue.
  if (!staffArea(staff.staffRole, "admin")) {
    return links.length > 1 ? <NavLinks links={links} /> : null;
  }
  const bot = await getBotStatus(staff.id, new Date());
  const missingLegal = await missingLegalPages();
  const lastSeen = (heartbeatAt: Date | null) =>
    heartbeatAt
      ? `letztes Lebenszeichen ${formatDateTime(heartbeatAt)}`
      : "noch kein Lebenszeichen";
  return (
    <div className="flex flex-col gap-2">
      <NavLinks links={links} />
      {missingLegal.length > 0 ? (
        <p className="text-[14px] text-accent-text">
          Rechtstexte fehlen in LEGAL_DIR oder enthalten noch „TODO“ (
          {missingLegal.map((page) => `${page}.txt`).join(", ")}): Bitte vor dem Go-Live ausfüllen.
        </p>
      ) : null}
      {bot.online ? (
        <p className="text-[14px]">Bot läuft ({lastSeen(bot.loops.sweeper.heartbeatAt)})</p>
      ) : (
        <div className="text-[14px] text-accent-text">
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

function NavLinks({ links }: { links: readonly { href: string; label: string }[] }) {
  return (
    <nav className="flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="underline underline-offset-2">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
