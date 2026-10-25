// The web dictionaries (§5.21): no German left in English. Functions are checked by their source,
// which holds their text (templates and JSX alike).
import { describe, expect, it } from "vitest";
import * as account from "../i18n/account.tsx";
import * as accountClient from "../i18n/account-client.ts";
import * as admin from "../i18n/admin.tsx";
import * as adminClient from "../i18n/admin-client.ts";
import * as chrome from "../i18n/chrome.ts";
import * as client from "../i18n/client.ts";
import * as common from "../i18n/common.ts";
import * as format from "../i18n/format.ts";
import * as mail from "../i18n/mail.ts";
import * as publicPages from "../i18n/public.tsx";
import * as scrims from "../i18n/scrims.tsx";
import * as scrimsClient from "../i18n/scrims-client.ts";
import * as team from "../i18n/team.tsx";
import * as teamClient from "../i18n/team-client.ts";

const FILES = {
  account,
  accountClient,
  admin,
  adminClient,
  chrome,
  client,
  common,
  format,
  mail,
  publicPages,
  scrims,
  scrimsClient,
  team,
  teamClient,
};

/** Umlauts, ß and the German opening quote; English uses “ ” and straight apostrophes. */
const GERMAN = /[äöüÄÖÜß„]/;

function texts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") return [String(value)];
  if (value && typeof value === "object") return Object.values(value).flatMap(texts);
  return [];
}

describe("web dictionaries", () => {
  it("have a German and an English part with the same entries", () => {
    for (const [file, exports] of Object.entries(FILES)) {
      for (const [name, dictionary] of Object.entries(exports)) {
        expect(Object.keys(dictionary as object).sort(), `${file}.${name}`).toEqual(["de", "en"]);
        const { de, en } = dictionary as { de: object; en: object };
        expect(Object.keys(en).sort(), `${file}.${name}`).toEqual(Object.keys(de).sort());
      }
    }
  });

  it("have no German in English", () => {
    for (const [file, exports] of Object.entries(FILES)) {
      for (const [name, dictionary] of Object.entries(exports)) {
        for (const text of texts((dictionary as { en: unknown }).en)) {
          expect(text, `${file}.${name}`).not.toMatch(GERMAN);
        }
      }
    }
  });
});
