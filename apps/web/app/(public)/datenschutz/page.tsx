import { LegalContent } from "@/components/legal-content";
import { legalMessages } from "@/i18n/public";
import { getMessages } from "@/lib/locale";

// Content from <LEGAL_DIR>/datenschutz.txt (SPEC P0-10), in English from datenschutz.en.txt (§5.21).
export default async function DatenschutzPage() {
  const t = await getMessages(legalMessages);
  return <LegalContent page="datenschutz" title={t.privacyTitle} />;
}
