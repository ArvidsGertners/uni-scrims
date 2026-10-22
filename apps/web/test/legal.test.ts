import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { missingLegalPages, parseLegalText, readLegalPage } from "../lib/legal.ts";

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
});
