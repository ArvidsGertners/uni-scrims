import { isDevLoginEnabled } from "@uni-scrims/core/config/dev";
import Link from "next/link";

/** The hub server note required before login (SPEC Flow A), and the dev login. */
export function LoginNote() {
  return (
    <>
      <p className="text-[13px] text-pretty text-muted-foreground">
        Beim Anmelden wirst du automatisch dem Uni-Scrims-Discord-Server hinzugefügt. Das ist nötig,
        damit unser Bot dir Nachrichten schicken kann, zum Beispiel das Ergebnis deiner
        Verifizierung oder Infos zu deinen Scrims.
      </p>
      {isDevLoginEnabled() ? (
        <Link href="/dev-login" className="text-[13px] underline underline-offset-2">
          Dev-Login als Seed-Nutzer
        </Link>
      ) : null}
    </>
  );
}
