// Links to OPL (opleague.pro, ARCHITECTURE §5.37): profile and team links as users paste them, and
// the links built back from the stored IDs. Pure, without database or network.
import { DomainError } from "../errors.ts";

export type OplKind = "user" | "team";

const OPL_HOSTS = new Set(["opleague.pro", "www.opleague.pro"]);
const OPL_ORIGIN = "https://www.opleague.pro";
// /user/12345 or /team/12345, optionally with the name after a dash ("/user/12345-Name") and a
// language prefix before it ("/de/user/…"); trailing path parts are ignored.
const OPL_PATH = /^\/(?:[a-z]{2}\/)?(user|team)\/(\d{1,9})(?:-[^/]*)?(?:\/.*)?$/i;

const INVALID = { user: "oplUserLinkInvalid", team: "oplTeamLinkInvalid" } as const;

/** The OPL ID in a pasted profile or team link; throws INVALID for anything else. */
export function parseOplUrl(kind: OplKind, raw: string): number {
  const invalid = () => new DomainError("INVALID", INVALID[kind]);
  const value = raw.trim();
  if (value === "" || value.length > 300) throw invalid();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw invalid();
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw invalid();
  if (!OPL_HOSTS.has(url.hostname)) throw invalid();
  const match = OPL_PATH.exec(url.pathname);
  if (!match || match[1]!.toLowerCase() !== kind) throw invalid();
  const id = Number(match[2]);
  if (!Number.isSafeInteger(id) || id <= 0) throw invalid();
  return id;
}

/** OPL answers these without the name in the path too. */
export function oplUserUrl(id: number): string {
  return `${OPL_ORIGIN}/user/${id}`;
}

export function oplTeamUrl(id: number): string {
  return `${OPL_ORIGIN}/team/${id}`;
}
