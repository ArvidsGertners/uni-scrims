// Row locks and transactions. SELECT … FOR NO KEY UPDATE is the only raw SQL allowed (ARCHITECTURE §4).
// NO KEY UPDATE instead of UPDATE: the locks still exclude each other, but do not block the
// FOR KEY SHARE locks that foreign key checks take. With FOR UPDATE, dissolving a team (holds the
// Team lock, then locks its requests) deadlocked with applying to one of its requests (holds the
// request lock, then inserts a notification referencing the Team).
// Lock order in every transaction (ARCHITECTURE §4): Team → User → ScrimRequest → Scrim →
// Conversation (Phase 32), several rows of one table sorted by id; VerificationRequest, Application
// and Notification rows only after that.
// RequestSeries rows have no lock of their own: only holders of their team's lock change them, except
// deleteAccount clearing notes, which postSeriesRequests waits for on the creator's user row (§5.27).
// A fixed partnership (Phase 30) has two teams: booking from it or ending it holds both team rows,
// retireTeamActivity holds one and only sets endedAt (§5.28).
import { type Prisma, prisma } from "@uni-scrims/db";
import type { Db } from "./db.ts";

export async function lockTeam(tx: Prisma.TransactionClient, teamId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR NO KEY UPDATE`;
}

/** Several team rows, sorted by id and each once (§4). */
export async function lockTeams(tx: Prisma.TransactionClient, teamIds: string[]): Promise<void> {
  for (const teamId of [...new Set(teamIds)].sort()) await lockTeam(tx, teamId);
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

/** A message thread (Phase 32, §5.30), after the user row. */
export async function lockConversation(
  tx: Prisma.TransactionClient,
  conversationId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${conversationId} FOR NO KEY UPDATE`;
}

/** Runs fn in the caller's transaction, or in a new one when db is the shared client. */
export async function inTransaction<T>(
  db: Db,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  // Identity check: the shared client is a lazy proxy, so `"$transaction" in db` would be false.
  return db === prisma ? prisma.$transaction(fn) : fn(db as Prisma.TransactionClient);
}
