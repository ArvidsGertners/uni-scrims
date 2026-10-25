import { LegalContent } from "@/components/legal-content";
import { legalMessages } from "@/i18n/public";
import { getMessages } from "@/lib/locale";

// Content from <LEGAL_DIR>/impressum.txt (SPEC P0-10), in English from impressum.en.txt (§5.21),
// then the Riot notice from the code.
export default async function ImpressumPage() {
  const t = await getMessages(legalMessages);
  return (
    <LegalContent page="impressum" title={t.impressumTitle}>
      {/* The notice Riot's "Legal Jibber Jabber" policy asks for, as the rank icons are Riot's
          assets (ARCHITECTURE §5.19): in German translated, with the original word for word below;
          in English only the original (§5.21). */}
      <section className="flex flex-col gap-4">
        <h2 className="mt-2 type-h2">Riot Games</h2>
        {t.riotTranslation ? (
          <>
            <p className="text-pretty">{t.riotTranslation}</p>
            <blockquote
              lang="en"
              className="border-l-2 border-border pl-4 text-pretty text-muted-foreground"
            >
              {t.riotOriginal}
            </blockquote>
          </>
        ) : (
          <p className="text-pretty">{t.riotOriginal}</p>
        )}
      </section>
    </LegalContent>
  );
}
