import { Prisma, type PrismaClient } from "@uni-scrims/db";

// Either the shared client or the client of an interactive transaction.
export type Db = PrismaClient | Prisma.TransactionClient;

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}
