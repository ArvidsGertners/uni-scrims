// Query values of the GET filters; /board passes them on to /scrims when signed in (§5.26).
import { describe, expect, it } from "vitest";
import { list, single, toQueryString } from "../lib/search-params.ts";

describe("search params", () => {
  it("reads single and repeated values", () => {
    expect(single("GOLD")).toBe("GOLD");
    expect(single(["GOLD", "IRON"])).toBeUndefined();
    expect(list(undefined)).toEqual([]);
    expect(list("GOLD")).toEqual(["GOLD"]);
    expect(list(["GOLD", "IRON"])).toEqual(["GOLD", "IRON"]);
  });

  it("builds the query string again, repeated values and encoding included", () => {
    expect(toQueryString({})).toBe("");
    expect(toQueryString({ datum: undefined })).toBe("");
    expect(
      toQueryString({ datum: "2026-10-23", rang: ["GOLD", "PLATINUM"], zuverlaessig: "1" }),
    ).toBe("?datum=2026-10-23&rang=GOLD&rang=PLATINUM&zuverlaessig=1");
    expect(toQueryString({ suche: "a&b c" })).toBe("?suche=a%26b+c");
  });
});
