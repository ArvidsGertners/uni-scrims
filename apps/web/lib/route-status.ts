import type { DomainError } from "@uni-scrims/core";

const STATUS_BY_CODE: Partial<Record<DomainError["code"], number>> = {
  UNAUTHENTICATED: 401,
  BANNED: 403,
  FORBIDDEN: 403,
  ACCOUNT_INCOMPLETE: 403,
  TWO_FACTOR_REQUIRED: 403,
  NOT_FOUND: 404,
};

/** HTTP status for a core error in route handlers that serve files; 400 for the rest. */
export function statusForDomainError(error: DomainError): number {
  return STATUS_BY_CODE[error.code] ?? 400;
}
