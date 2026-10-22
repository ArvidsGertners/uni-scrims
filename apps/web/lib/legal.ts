// Impressum and privacy policy come from text files outside the repository (SPEC P0-10), so the
// operator's address is not in git and the texts change without a new build.
import { readFile } from "node:fs/promises";
import path from "node:path";

export type LegalPage = "impressum" | "datenschutz";

export type LegalBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "list"; items: string[] };

/**
 * The plain text format: "## " starts a heading, "- " a list item, a blank line ends a paragraph.
 * Line breaks inside a paragraph are kept (addresses).
 */
export function parseLegalText(text: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ type: "paragraph", lines: paragraph });
    if (list.length > 0) blocks.push({ type: "list", items: list });
    paragraph = [];
    list = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") {
      flush();
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push({ type: "heading", text: line.slice(3).trim() });
    } else if (line.startsWith("- ")) {
      if (paragraph.length > 0) flush();
      list.push(line.slice(2).trim());
    } else {
      if (list.length > 0) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

/**
 * Reads `<LEGAL_DIR>/<page>.txt`; null if the directory is not configured or the file is missing.
 * LEGAL_DIR must be absolute, like UPLOAD_DIR, so it does not depend on the working directory.
 */
export async function readLegalPage(
  page: LegalPage,
  env: Record<string, string | undefined> = process.env,
): Promise<LegalBlock[] | null> {
  const dir = env.LEGAL_DIR;
  if (!dir || !path.isAbsolute(dir)) {
    console.error("LEGAL_DIR must be set to an absolute path");
    return null;
  }
  try {
    return parseLegalText(await readFile(path.join(dir, `${page}.txt`), "utf8"));
  } catch (error) {
    console.error(`Could not read the legal page ${page}`, error);
    return null;
  }
}
