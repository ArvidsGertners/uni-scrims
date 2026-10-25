import { connection } from "next/server";
import { Fragment, type ReactNode } from "react";
import { type LegalPage, readLegalPage } from "@/lib/legal";
import { PageMain } from "@/components/page-main";

/**
 * Impressum or privacy policy from LEGAL_DIR; a placeholder if the file is missing. `children` come
 * after the text, for sections that live in the code (the Riot notice, ARCHITECTURE §5.19).
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
  const blocks = await readLegalPage(page);

  return (
    <PageMain className="gap-4">
      <h1 className="type-h1">{title}</h1>
      {blocks === null || blocks.length === 0 ? <p>Inhalt folgt.</p> : null}
      {blocks?.map((block, index) => {
        switch (block.type) {
          case "heading":
            return (
              <h2 key={index} className="mt-2 type-h2">
                {block.text}
              </h2>
            );
          case "list":
            return (
              <ul key={index} className="list-disc pl-5">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </ul>
            );
          default:
            return (
              <p key={index}>
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
