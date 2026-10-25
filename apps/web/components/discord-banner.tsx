import Link from "next/link";
import { AlertTriangleIcon } from "@/components/icons";
import { discordWarningMessages } from "@/i18n/chrome";
import { getMessages } from "@/lib/locale";

// Shown on every page while hubJoinFailedAt or dmFailedAt is set (ARCHITECTURE §5.1); the fix,
// including the hub invite link, is on the account page.
export async function DiscordBanner() {
  const t = await getMessages(discordWarningMessages);
  return (
    <div className="border-b border-warning-line bg-warning-soft">
      {/* Full width like the header of signed-in users (§5.15). */}
      <div className="flex items-start gap-3 px-5 py-3 sm:px-8">
        <AlertTriangleIcon size={20} className="mt-px text-warning" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[14px] font-semibold text-foreground">{t.bannerTitle}</span>
          <span className="text-[13px] text-muted-foreground">
            {t.bannerText}{" "}
            <Link
              href="/account"
              className="font-semibold text-warning underline underline-offset-2"
            >
              {t.bannerLink}
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}
