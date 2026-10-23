/** How to fix undeliverable DMs; the banner on every page links here (ARCHITECTURE §5.1). */
export function DiscordDmWarning({ hubJoinFailed }: { hubJoinFailed: boolean }) {
  const inviteUrl = process.env.HUB_INVITE_URL;
  return (
    <div className="flex flex-col gap-1 rounded-sm border border-warning-line bg-warning-soft px-4 py-3.5">
      <span className="text-[14px] font-semibold text-warning">
        Discord-Nachrichten kommen nicht an
      </span>
      {hubJoinFailed ? (
        <span className="text-[14px] text-pretty text-muted-foreground">
          Tritt dem Uni-Scrims-Server bei
          {inviteUrl ? (
            <>
              {": "}
              <a
                href={inviteUrl}
                target="_blank"
                rel="noreferrer"
                className="font-semibold break-all text-warning underline underline-offset-2"
              >
                {inviteUrl}
              </a>
            </>
          ) : null}
          . Erlaube dort in den Privatsphäre-Einstellungen „Direktnachrichten von
          Servermitgliedern“.
        </span>
      ) : (
        <span className="text-[14px] text-pretty text-muted-foreground">
          Öffne in Discord die Privatsphäre-Einstellungen des Uni-Scrims-Servers und erlaube
          „Direktnachrichten von Servermitgliedern“.
        </span>
      )}
    </div>
  );
}
