import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  missingLegalPages,
  parseLegalText,
  readLegalPage,
  readShownLegalPage,
} from "../lib/legal.ts";

describe("parseLegalText", () => {
  it("reads headings, paragraphs with line breaks and lists", () => {
    const text = [
      "## Angaben",
      "Max Muster",
      "  Musterweg 1  ",
      "",
      "",
      "Ein Absatz.",
      "- erster Punkt",
      "- zweiter Punkt",
      "Nach der Liste.",
      "## Kontakt",
      "mail@example.org",
    ].join("\r\n");
    expect(parseLegalText(text)).toEqual([
      { type: "heading", text: "Angaben" },
      { type: "paragraph", lines: ["Max Muster", "Musterweg 1"] },
      { type: "paragraph", lines: ["Ein Absatz."] },
      { type: "list", items: ["erster Punkt", "zweiter Punkt"] },
      { type: "paragraph", lines: ["Nach der Liste."] },
      { type: "heading", text: "Kontakt" },
      { type: "paragraph", lines: ["mail@example.org"] },
    ]);
  });

  it("treats lines without a space after the markers as text", () => {
    expect(parseLegalText("##Kein Titel\n-kein Punkt")).toEqual([
      { type: "paragraph", lines: ["##Kein Titel", "-kein Punkt"] },
    ]);
  });
});

describe("readLegalPage", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "uni-scrims-legal-"));
    await writeFile(path.join(dir, "impressum.txt"), "## Impressum\nText");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it("reads the file of the page from LEGAL_DIR", async () => {
    await expect(readLegalPage("impressum", { LEGAL_DIR: dir })).resolves.toEqual([
      { type: "heading", text: "Impressum" },
      { type: "paragraph", lines: ["Text"] },
    ]);
  });

  it("returns null for a missing file or a missing or relative LEGAL_DIR", async () => {
    await expect(readLegalPage("datenschutz", { LEGAL_DIR: dir })).resolves.toBeNull();
    await expect(readLegalPage("impressum", {})).resolves.toBeNull();
    await expect(readLegalPage("impressum", { LEGAL_DIR: "docker/legal" })).resolves.toBeNull();
  });

  it("lists the pages that would show the placeholder, without logging each file", async () => {
    vi.mocked(console.error).mockClear();
    await expect(missingLegalPages({ LEGAL_DIR: dir })).resolves.toEqual(["datenschutz"]);
    expect(console.error).not.toHaveBeenCalled();
    await writeFile(path.join(dir, "datenschutz.txt"), "\n\n");
    await expect(missingLegalPages({ LEGAL_DIR: dir })).resolves.toEqual(["datenschutz"]);
    await writeFile(path.join(dir, "datenschutz.txt"), "Text");
    await expect(missingLegalPages({ LEGAL_DIR: dir })).resolves.toEqual([]);
    await expect(missingLegalPages({})).resolves.toEqual(["impressum", "datenschutz"]);
  });

  it("reports the scaffold that was copied but not filled in", async () => {
    const scaffold = path.resolve(import.meta.dirname, "../../../docker/legal.example");
    await expect(missingLegalPages({ LEGAL_DIR: scaffold })).resolves.toEqual([
      "impressum",
      "datenschutz",
    ]);
    await writeFile(path.join(dir, "datenschutz.txt"), "## Rechte\n- TODO: Auskunft");
    await expect(missingLegalPages({ LEGAL_DIR: dir })).resolves.toEqual(["datenschutz"]);
  });

  it("reads the English version and falls back to the German text (§5.21)", async () => {
    const english = await mkdtemp(path.join(tmpdir(), "uni-scrims-legal-en-"));
    try {
      await writeFile(path.join(english, "impressum.txt"), "## Angaben\nText");
      const env = { LEGAL_DIR: english };
      await expect(readShownLegalPage("impressum", "en", env)).resolves.toEqual({
        blocks: [
          { type: "heading", text: "Angaben" },
          { type: "paragraph", lines: ["Text"] },
        ],
        locale: "de",
      });
      await expect(missingLegalPages(env, "en")).resolves.toEqual(["impressum", "datenschutz"]);
      // A copied scaffold still counts as missing and does not replace the German text.
      await writeFile(path.join(english, "impressum.en.txt"), "## Details\nTODO: name");
      await expect(readShownLegalPage("impressum", "en", env)).resolves.toMatchObject({
        locale: "de",
      });
      await writeFile(path.join(english, "impressum.en.txt"), "## Details\nName");
      await expect(readShownLegalPage("impressum", "en", env)).resolves.toEqual({
        blocks: [
          { type: "heading", text: "Details" },
          { type: "paragraph", lines: ["Name"] },
        ],
        locale: "en",
      });
      await expect(readShownLegalPage("impressum", "de", env)).resolves.toMatchObject({
        locale: "de",
        blocks: [{ type: "heading", text: "Angaben" }, expect.anything()],
      });
      await expect(missingLegalPages(env, "en")).resolves.toEqual(["datenschutz"]);
    } finally {
      await rm(english, { recursive: true, force: true });
    }
  });
});
