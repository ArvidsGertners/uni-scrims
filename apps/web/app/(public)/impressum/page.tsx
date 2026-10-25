import { LegalContent } from "@/components/legal-content";

// Content from <LEGAL_DIR>/impressum.txt (SPEC P0-10), then the Riot notice from the code.
export default function ImpressumPage() {
  return (
    <LegalContent page="impressum" title="Impressum">
      {/* The notice Riot's "Legal Jibber Jabber" policy asks for, as the rank icons are Riot's
          assets (ARCHITECTURE §5.19): translated, with the original word for word below. */}
      <section className="flex flex-col gap-4">
        <h2 className="mt-2 type-h2">Riot Games</h2>
        <p className="text-pretty">
          Uni Scrims wurde unter der Richtlinie „Legal Jibber Jabber“ von Riot Games mit Assets
          erstellt, die Riot Games gehören. Riot Games unterstützt oder sponsert dieses Projekt
          nicht.
        </p>
        <blockquote
          lang="en"
          className="border-l-2 border-border pl-4 text-pretty text-muted-foreground"
        >
          Uni Scrims was created under Riot Games&apos; &quot;Legal Jibber Jabber&quot; policy using
          assets owned by Riot Games. Riot Games does not endorse or sponsor this project.
        </blockquote>
      </section>
    </LegalContent>
  );
}
