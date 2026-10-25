// Impressum and privacy policy come from text files outside the repository (SPEC P0-10), so the
// operator's address is not in git and the texts change without a new build.
// Since Phase 22 each page may have an English version `<page>.en.txt` (§5.21); the German file
// stays the binding one.
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Locale } from "@uni-scrims/core/config/locale";

export const LEGAL_PAGES = ["impressum", "datenschutz"] as const;
export type LegalPage = (typeof LEGAL_PAGES)[number];

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

function legalFileName(page: LegalPage, locale: Locale): string {
  return locale === "de" ? `${page}.txt` : `${page}.${locale}.txt`;
}

/**
 * Reads `<LEGAL_DIR>/<page>.txt`, or with `locale` "en" `<page>.en.txt`; null if the directory is
 * not configured or the file is missing. LEGAL_DIR must be absolute, like UPLOAD_DIR, so it does not
 * depend on the working directory.
 */
export async function readLegalPage(
  page: LegalPage,
  env: Record<string, string | undefined> = process.env,
  options: { quiet?: boolean; locale?: Locale } = {},
): Promise<LegalBlock[] | null> {
  const dir = env.LEGAL_DIR;
  if (!dir || !path.isAbsolute(dir)) {
    if (!options.quiet) console.error("LEGAL_DIR must be set to an absolute path");
    return null;
  }
  const file = legalFileName(page, options.locale ?? "de");
  try {
    return parseLegalText(await readFile(path.join(dir, file), "utf8"));
  } catch (error) {
    if (!options.quiet) console.error(`Could not read the legal page ${file}`, error);
    return null;
  }
}

/**
 * The text a page shows in a language (§5.21): the English version if there is a finished one,
 * otherwise the German text, with the language it is in, so the page can say so.
 */
export async function readShownLegalPage(
  page: LegalPage,
  locale: Locale,
  env: Record<string, string | undefined> = process.env,
): Promise<{ blocks: LegalBlock[] | null; locale: Locale }> {
  if (locale !== "de") {
    const blocks = await readLegalPage(page, env, { quiet: true, locale });
    if (blocks && blocks.length > 0 && !isUnfinished(blocks)) return { blocks, locale };
  }
  return { blocks: await readLegalPage(page, env), locale: "de" };
}

/** Marks what is still to be written; the scaffold in docker/legal.example uses it on every point. */
export const LEGAL_TODO_MARKER = "TODO";

function isUnfinished(blocks: LegalBlock[]): boolean {
  const text = blocks.flatMap((block) =>
    block.type === "heading" ? [block.text] : block.type === "list" ? block.items : block.lines,
  );
  return text.some((line) => line.includes(LEGAL_TODO_MARKER));
}

/**
 * Pages whose text is missing, empty or still contains "TODO" (the scaffold copied but not filled
 * in); missing and empty ones show "Inhalt folgt." (ARCHITECTURE §8). The admin page and the start
 * of the web process report them, so a server without its legal texts is noticed. With `locale`
 * "en" the English versions, which fall back to the German text (§5.21).
 */
export async function missingLegalPages(
  env: Record<string, string | undefined> = process.env,
  locale: Locale = "de",
): Promise<LegalPage[]> {
  const missing: LegalPage[] = [];
  for (const page of LEGAL_PAGES) {
    // Quiet: the callers report the result once instead of a line per file.
    const blocks = await readLegalPage(page, env, { quiet: true, locale });
    if (!blocks || blocks.length === 0 || isUnfinished(blocks)) missing.push(page);
  }
  return missing;
}
