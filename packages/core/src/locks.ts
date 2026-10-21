// Row locks and transactions. SELECT … FOR UPDATE is the only raw SQL allowed (ARCHITECTURE §4).
import { type Prisma, prisma } from "@uni-scrims/db";
import type { Db } from "./db.ts";

export async function lockTeam(tx: Prisma.TransactionClient, teamId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;
}

export async function lockRequest(tx: Prisma.TransactionClient, requestId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "ScrimRequest" WHERE id = ${requestId} FOR UPDATE`;
}

export async function lockScrim(tx: Prisma.TransactionClient, scrimId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Scrim" WHERE id = ${scrimId} FOR UPDATE`;
}

/** Runs fn in the caller's transaction, or in a new one when db is the shared client. */
export async function inTransaction<T>(
  db: Db,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  // Identity check: the shared client is a lazy proxy, so `"$transaction" in db` would be false.
  return db === prisma ? prisma.$transaction(fn) : fn(db as Prisma.TransactionClient);
}
