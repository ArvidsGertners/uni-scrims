// Domain errors carry a German message that the UI shows as is.

export type DomainErrorCode =
  | "UNAUTHENTICATED"
  | "BANNED"
  | "NOT_VERIFIED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID";

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
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
export type Problem = Readonly<{ kind: ProblemKind; code: DomainErrorCode; message: string }>;

export function problemError(problem: Problem): DomainError {
  return new DomainError(problem.code, problem.message);
}
