import { discordWarningMessages } from "@/i18n/chrome";
import { getMessages } from "@/lib/locale";

/** How to fix undeliverable DMs; the banner on every page links here (ARCHITECTURE §5.1). */
export async function DiscordDmWarning({ hubJoinFailed }: { hubJoinFailed: boolean }) {
  const t = await getMessages(discordWarningMessages);
  const inviteUrl = process.env.HUB_INVITE_URL;
  return (
    <div className="flex flex-col gap-1 rounded-sm border border-warning-line bg-warning-soft px-4 py-3.5">
      <span className="text-[14px] font-semibold text-warning">{t.title}</span>
      {hubJoinFailed ? (
        <span className="text-[14px] text-pretty text-muted-foreground">
          {t.joinHub(
            inviteUrl ? (
              <a
                key="invite"
                href={inviteUrl}
                target="_blank"
                rel="noreferrer"
                className="font-semibold break-all text-warning underline underline-offset-2"
              >
                {inviteUrl}
              </a>
            ) : null,
          )}
        </span>
      ) : (
        <span className="text-[14px] text-pretty text-muted-foreground">{t.allowDms}</span>
      )}
    </div>
  );
}
