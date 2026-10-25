// German texts that core writes into the database (§5.21). Rows keep them, so the values must never
// change; pages show them translated when they match exactly. Free texts of admins stay as written.
import { type Locale, dictionary } from "../../config/locale.ts";

/** The name of a deleted account (§4). */
export const DELETED_USER_NAME = "Gelöschter Nutzer";
/** The name of an account until Discord is linked, never the real name (§5.8). */
export const NEW_ACCOUNT_NAME = "Neues Konto";

/** A review nobody decided within the time limit (§5.2). */
export const AUTO_REJECT_REASON = "Prüfung nicht rechtzeitig erfolgt";
/** banUser closes a pending request with this reason and without a message. */
export const BAN_REJECT_REASON = "Konto gesperrt";
/** Accounts from before Phase 7 verify again with their real name (SPEC N-3). */
export const LEGACY_REJECT_REASON =
  "Bitte vervollständige dein Konto und lade die Bescheinigung erneut hoch.";

const STORED_TEXTS = dictionary<Record<string, string>>(
  {},
  {
    [DELETED_USER_NAME]: "Deleted user",
    [NEW_ACCOUNT_NAME]: "New account",
    [AUTO_REJECT_REASON]: "Not reviewed in time",
    [BAN_REJECT_REASON]: "Account banned",
    [LEGACY_REJECT_REASON]: "Please complete your account and upload the certificate again.",
  },
);

function shown(value: string, locale: Locale): string {
  return Object.hasOwn(STORED_TEXTS[locale], value) ? STORED_TEXTS[locale][value]! : value;
}

/** A user's name as shown: the placeholders of new and deleted accounts in the page's language. */
export function userDisplayName(name: string, locale: Locale): string {
  return shown(name, locale);
}

/** A rejection reason as shown: the fixed reasons of core translated, an admin's text as written. */
export function rejectReasonText(reason: string, locale: Locale): string {
  return shown(reason, locale);
}
