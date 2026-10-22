// Row locks and transactions. SELECT … FOR NO KEY UPDATE is the only raw SQL allowed (ARCHITECTURE §4).
// NO KEY UPDATE instead of UPDATE: the locks still exclude each other, but do not block the
// FOR KEY SHARE locks that foreign key checks take. With FOR UPDATE, dissolving a team (holds the
// Team lock, then locks its requests) deadlocked with applying to one of its requests (holds the
// request lock, then inserts a notification referencing the Team).
// Lock order in every transaction (ARCHITECTURE §4): Team → User → ScrimRequest (several by id) →
// Scrim; VerificationRequest, Application and Notification rows only after that.
import { type Prisma, prisma } from "@uni-scrims/db";
import type { Db } from "./db.ts";

export async function lockTeam(tx: Prisma.TransactionClient, teamId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR NO KEY UPDATE`;
}

/** The Better Auth table "user" keeps its @@map; the only lock on a table that is not a domain model. */
export async function lockUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${userId} FOR NO KEY UPDATE`;
}

export async function lockRequest(tx: Prisma.TransactionClient, requestId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "ScrimRequest" WHERE id = ${requestId} FOR NO KEY UPDATE`;
}

export async function lockScrim(tx: Prisma.TransactionClient, scrimId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Scrim" WHERE id = ${scrimId} FOR NO KEY UPDATE`;
}

/** Runs fn in the caller's transaction, or in a new one when db is the shared client. */
export async function inTransaction<T>(
  db: Db,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  // Identity check: the shared client is a lazy proxy, so `"$transaction" in db` would be false.
  return db === prisma ? prisma.$transaction(fn) : fn(db as Prisma.TransactionClient);
}
