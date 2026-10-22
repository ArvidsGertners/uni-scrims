import { connection } from "next/server";
import { Fragment } from "react";
import { type LegalPage, readLegalPage } from "@/lib/legal";

/** Impressum or privacy policy from LEGAL_DIR; a placeholder if the file is missing. */
export async function LegalContent({ page, title }: { page: LegalPage; title: string }) {
  // Read per request: `next build` would otherwise prerender the page without the file.
  await connection();
  const blocks = await readLegalPage(page);

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-12">
      <h1 className="text-2xl font-bold">{title}</h1>
      {blocks === null || blocks.length === 0 ? <p>Inhalt folgt.</p> : null}
      {blocks?.map((block, index) => {
        switch (block.type) {
          case "heading":
            return (
              <h2 key={index} className="mt-2 text-lg font-semibold">
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
    </main>
  );
}
