import { connection } from "next/server";
import { Fragment, type ReactNode } from "react";
import { legalMessages } from "@/i18n/public";
import { type LegalPage, readShownLegalPage } from "@/lib/legal";
import { getLocale, getMessages } from "@/lib/locale";
import { PageMain } from "@/components/page-main";

/**
 * Impressum or privacy policy from LEGAL_DIR; a placeholder if the file is missing. `children` come
 * after the text, for sections that live in the code (the Riot notice, ARCHITECTURE §5.19). Without
 * a finished English version the English page shows the German text and says so (§5.21).
 */
export async function LegalContent({
  page,
  title,
  children,
}: {
  page: LegalPage;
  title: string;
  children?: ReactNode;
}) {
  // Read per request: `next build` would otherwise prerender the page without the file.
  await connection();
  const locale = await getLocale();
  const t = await getMessages(legalMessages);
  const { blocks, locale: textLocale } = await readShownLegalPage(page, locale);
  const empty = blocks === null || blocks.length === 0;
  // Marks the German text on an English page, for screen readers and translation tools.
  const lang = textLocale === locale ? undefined : textLocale;

  return (
    <PageMain className="gap-4">
      <h1 className="type-h1">{title}</h1>
      {empty ? <p>{t.contentToFollow}</p> : null}
      {!empty && lang ? <p className="text-muted-foreground">{t.germanOnly}</p> : null}
      {blocks?.map((block, index) => {
        switch (block.type) {
          case "heading":
            return (
              <h2 key={index} lang={lang} className="mt-2 type-h2">
                {block.text}
              </h2>
            );
          case "list":
            return (
              <ul key={index} lang={lang} className="list-disc pl-5">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </ul>
            );
          default:
            return (
              <p key={index} lang={lang}>
                {block.lines.map((line, lineIndex) => (
                  <Fragment key={lineIndex}>
                    {lineIndex > 0 ? <br /> : null}
                    {line}
                  </Fragment>
                ))}
              </p>
            );
        }
      })}
      {children}
    </PageMain>
  );
}
