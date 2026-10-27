// Route dialogs (ARCHITECTURE §5.33): which addresses are dialogs and where closing leads.
import { describe, expect, it } from "vitest";
import {
  closeTarget,
  isDialogPath,
  needsFullLoad,
  nextEnteredFromPage,
} from "../lib/route-dialog.ts";

describe("isDialogPath", () => {
  it("knows the dialog addresses, with or without a trailing slash", () => {
    for (const path of [
      "/requests/new",
      "/ready",
      "/account",
      "/account/notifications",
      "/verify",
    ]) {
      expect(isDialogPath(path)).toBe(true);
    }
    expect(isDialogPath("/team/settings/")).toBe(true);
    expect(isDialogPath("/support")).toBe(true);
  });

  it("leaves pages alone", () => {
    for (const path of ["/", "/scrims", "/team", "/requests/abc", "/account/setup"]) {
      expect(isDialogPath(path)).toBe(false);
    }
  });
});

describe("closeTarget", () => {
  it("goes back when the intercepted dialog was opened from a page", () => {
    expect(closeTarget({ intercepted: true, enteredFromPage: true, fallback: "/scrims" })).toEqual({
      kind: "back",
    });
  });

  it("replaces with the page behind otherwise", () => {
    const cases: [boolean, boolean][] = [
      [false, false],
      [false, true],
      [true, false],
    ];
    for (const [intercepted, enteredFromPage] of cases) {
      expect(closeTarget({ intercepted, enteredFromPage, fallback: "/team" })).toEqual({
        kind: "replace",
        href: "/team",
      });
    }
  });
});

describe("nextEnteredFromPage", () => {
  it("is true after a link from a page to a dialog", () => {
    expect(nextEnteredFromPage("/scrims", "/account", false)).toBe(true);
  });

  it("is false after a direct load and on pages", () => {
    expect(nextEnteredFromPage(null, "/account", false)).toBe(false);
    expect(nextEnteredFromPage("/account", "/scrims", true)).toBe(false);
  });

  it("keeps its value when switching between dialogs", () => {
    expect(nextEnteredFromPage("/account", "/account/notifications", true)).toBe(true);
    expect(nextEnteredFromPage("/account", "/account/notifications", false)).toBe(false);
  });
});

describe("needsFullLoad", () => {
  it("loads a dialog reached from signing in in full", () => {
    expect(needsFullLoad("/login", "/team/settings")).toBe(true);
    expect(needsFullLoad("/login/2fa", "/account")).toBe(true);
    expect(needsFullLoad("/account/setup", "/account/notifications")).toBe(true);
  });

  it("leaves dialogs over pages and pages alone", () => {
    expect(needsFullLoad("/scrims", "/account")).toBe(false);
    expect(needsFullLoad(null, "/account")).toBe(false);
    expect(needsFullLoad("/login", "/scrims")).toBe(false);
    expect(needsFullLoad("/account", "/account/notifications")).toBe(false);
  });
});
