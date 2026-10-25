// Domain errors carry a message key (ARCHITECTURE §5.21): the UI renders it in the request's language,
// `message` is the German text for logs, the bot (until Phase 23) and tests.
import { DEFAULT_LOCALE } from "../config/locale.ts";
import { type Message, type PlainMessageKey, renderMessage } from "./i18n/render.ts";
import type { AccountSetupStep } from "./users.ts";

export type DomainErrorCode =
  | "UNAUTHENTICATED"
  | "BANNED"
  | "NOT_VERIFIED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID"
  | "ACCOUNT_INCOMPLETE"
  | "TWO_FACTOR_REQUIRED";

export class DomainError extends Error {
  /** What the UI shows, in its language. */
  readonly text: Message;

  constructor(
    readonly code: DomainErrorCode,
    text: Message | PlainMessageKey,
  ) {
    const message: Message = typeof text === "string" ? ({ key: text } as Message) : text;
    super(renderMessage(message, DEFAULT_LOCALE));
    this.text = message;
    this.name = "DomainError";
  }
}

/** requireUser for an account that still lacks a setup step (§5.8); pages redirect by `step`. */
export class AccountIncompleteError extends DomainError {
  constructor(
    readonly step: AccountSetupStep,
    text: PlainMessageKey,
  ) {
    super("ACCOUNT_INCOMPLETE", text);
    this.name = "AccountIncompleteError";
  }
}

/** A staff check for an account with a role but without 2FA yet (§5.9); pages lead to the setup. */
export class TwoFactorRequiredError extends DomainError {
  constructor() {
    super("TWO_FACTOR_REQUIRED", "twoFactorRequired");
    this.name = "TwoFactorRequiredError";
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

/** Reasons that pages show with a link to where they can be fixed (§7). */
export type ProblemKind =
  "TEAM_BANNED" | "NOT_CAPTAIN" | "CAPTAIN_NOT_VERIFIED" | "TEAM_NOT_READY" | "REQUEST_LIMIT";

/**
 * Why an action is not possible: mutations throw it, pages show the same message. Readonly, since
 * the shared constants are handed out by reference.
 */
export type Problem = Readonly<{ kind: ProblemKind; code: DomainErrorCode; text: Message }>;

export function problemError(problem: Problem): DomainError {
  return new DomainError(problem.code, problem.text);
}
