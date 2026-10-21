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
