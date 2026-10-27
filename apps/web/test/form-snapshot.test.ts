// The state of a GET filter form that "Filtern" compares against (ARCHITECTURE §5.32).
import { describe, expect, it } from "vitest";
import { formSnapshot } from "../lib/form-snapshot.ts";

describe("formSnapshot", () => {
  it("ignores the order of entries, also of several values of one key", () => {
    expect(
      formSnapshot([
        ["rang", "GOLD"],
        ["datum", "2026-10-28"],
        ["rang", "SILVER"],
      ]),
    ).toBe(
      formSnapshot([
        ["datum", "2026-10-28"],
        ["rang", "SILVER"],
        ["rang", "GOLD"],
      ]),
    );
  });

  it("tells apart added, removed and changed values", () => {
    const base = formSnapshot([
      ["datum", ""],
      ["rang", "ALL"],
    ]);
    expect(
      formSnapshot([
        ["datum", ""],
        ["rang", "GOLD"],
      ]),
    ).not.toBe(base);
    expect(formSnapshot([["datum", ""]])).not.toBe(base);
    expect(
      formSnapshot([
        ["datum", ""],
        ["rang", "ALL"],
        ["verifiziert", "1"],
      ]),
    ).not.toBe(base);
    expect(
      formSnapshot([
        ["datum", "2026-10-28"],
        ["rang", "ALL"],
      ]),
    ).not.toBe(base);
  });

  it("keeps keys and values apart, also with separators in a search", () => {
    expect(formSnapshot([["suche", "a&b=c"]])).not.toBe(
      formSnapshot([
        ["suche", "a"],
        ["b", "c"],
      ]),
    );
    expect(formSnapshot([])).toBe("");
  });
});
