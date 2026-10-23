import Link from "next/link";
import { PageMain } from "@/components/page-main";

/** After the registration: the same for new and taken addresses (SPEC N-3). */
export default function RegisterSentPage() {
  return (
    <PageMain className="gap-4">
      <h1 className="type-h1">Schau in dein Postfach</h1>
      <p className="text-pretty text-muted-foreground">
        Wir haben dir einen Link zum Bestätigen deiner E-Mail-Adresse geschickt. Er ist 24 Stunden
        gültig und meldet dich an. Danach verknüpfst du noch Discord.
      </p>
      <p className="text-[14px] text-pretty text-muted-foreground">
        Keine Mail bekommen? Schau im Spam-Ordner nach. Wenn du dich{" "}
        <Link href="/login" className="font-semibold text-foreground underline underline-offset-2">
          anmeldest
        </Link>
        , schicken wir den Link noch einmal.
      </p>
    </PageMain>
  );
}
