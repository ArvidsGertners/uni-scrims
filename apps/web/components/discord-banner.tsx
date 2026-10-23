import Link from "next/link";
import { AlertTriangleIcon } from "@/components/icons";

// Shown on every page while hubJoinFailedAt or dmFailedAt is set (ARCHITECTURE §5.1); the fix,
// including the hub invite link, is on the account page.
export function DiscordBanner() {
  return (
    <div className="border-b border-warning-line bg-warning-soft">
      <div className="mx-auto flex max-w-3xl items-start gap-3 px-5 py-3 sm:px-8">
        <AlertTriangleIcon size={20} className="mt-px text-warning" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[14px] font-semibold text-foreground">
            Wir konnten dir keine Discord-Nachricht schicken
          </span>
          <span className="text-[13px] text-muted-foreground">
            Ohne Direktnachrichten verpasst du Bewerbungen und Zusagen.{" "}
            <Link
              href="/account"
              className="font-semibold text-warning underline underline-offset-2"
            >
              So behebst du das
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}
