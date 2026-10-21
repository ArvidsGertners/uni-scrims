import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Shown on every page while hubJoinFailedAt or dmFailedAt is set (ARCHITECTURE §5.1).
export function DiscordBanner() {
  const inviteUrl = process.env.HUB_INVITE_URL;
  return (
    <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
      <AlertTitle>Wir können dir keine Discord-Nachrichten schicken.</AlertTitle>
      <AlertDescription>
        <p>
          Tritt dem Uni-Scrims-Server bei
          {inviteUrl ? (
            <>
              {": "}
              <a href={inviteUrl} target="_blank" rel="noreferrer">
                {inviteUrl}
              </a>
            </>
          ) : null}
          . Erlaube dort in den Privatsphäre-Einstellungen Direktnachrichten von Servermitgliedern.
        </p>
      </AlertDescription>
    </Alert>
  );
}
