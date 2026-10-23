// After restoring a database backup (ARCHITECTURE §8, README): bans and account deletions made after
// the backup are missing from the restored database. They are exported from the old database while
// it is still readable and applied again here. Operations only; no permission check, no web caller.
import { randomUUID } from "node:crypto";
import { prisma } from "@uni-scrims/db";
import { z } from "zod";
import { deleteAccount } from "./account.ts";
import { isDomainError } from "./errors.ts";
import { banTeamInTx, banUserInTx } from "./moderation.ts";
import { findOwnTeam, isCaptainOf } from "./permissions.ts";
import { TRANSFER_CAPTAIN_FIRST, transferCaptain } from "./teams.ts";
import { removeFilesAfterCommit } from "./verification.ts";
import {
  DISCORD_PROVIDER,
  banPlaceholderData,
  findUserByDiscordId,
  isDeletedUser,
} from "./users.ts";

/** What the README's export query writes from the old database. */
export const moderationExportSchema = z.object({
  bannedTeams: z.array(z.object({ id: z.string().min(1) })),
  bannedUsers: z.array(z.object({ id: z.string().min(1), discordId: z.string().regex(/^\d+$/) })),
  deletedUsers: z.array(z.object({ id: z.string().min(1) })),
});
export type ModerationExport = z.infer<typeof moderationExportSchema>;

export type ReapplyReport = {
  bannedTeams: number;
  bannedUsers: number;
  /** Banned in the old database, unknown in the restored one: kept as a banned, deleted user. */
  bannedPlaceholders: number;
  deletedUsers: number;
  /** Deleted captains whose role went to the longest-standing member first. */
  transferredCaptains: number;
};

/**
 * Applies bans and deletions again, in this order: teams, users, deletions (a banned user who also
 * deleted the account ends up banned and deleted, as in the old database). Idempotent: what the
 * restored database already has is skipped, so a second run changes nothing.
 */
export async function reapplyModeration(input: {
  /** The export, checked against moderationExportSchema. */
  entries: unknown;
  uploadDir: string;
  now: Date;
}): Promise<ReapplyReport> {
  const entries = moderationExportSchema.parse(input.entries);
  const { uploadDir, now } = input;
  const report: ReapplyReport = {
    bannedTeams: 0,
    bannedUsers: 0,
    bannedPlaceholders: 0,
    deletedUsers: 0,
    transferredCaptains: 0,
  };

  for (const { id } of entries.bannedTeams) {
    const banned = await prisma.$transaction(async (tx) => {
      const team = await tx.team.findUnique({ where: { id } });
      // Unknown here (founded after the backup) or dissolved: nothing left to ban.
      if (!team || team.dissolvedAt || team.bannedAt) return false;
      return banTeamInTx(tx, id, now);
    });
    if (banned) report.bannedTeams++;
  }

  for (const { id, discordId } of entries.bannedUsers) {
    // The user a login with this Discord account lands on; may differ from the old ID.
    const user = await findUserByDiscordId(discordId);
    if (user?.bannedAt) continue;
    if (user) {
      const { closedVerifications } = await prisma.$transaction((tx) =>
        banUserInTx(tx, user.id, now),
      );
      await removeFilesAfterCommit(closedVerifications, uploadDir);
      report.bannedUsers++;
      continue;
    }
    // Not in the restored database: keep only the Discord ID with the ban (the placeholder of a
    // banned user who deleted the account, §4), so a new login lands on a banned user.
    const userId = (await prisma.user.findUnique({ where: { id } })) ? randomUUID() : id;
    await prisma.user.create({
      data: {
        ...banPlaceholderData(userId, now, now),
        accounts: {
          create: {
            id: randomUUID(),
            providerId: DISCORD_PROVIDER,
            accountId: discordId,
            createdAt: now,
          },
        },
      },
    });
    report.bannedPlaceholders++;
  }

  for (const { id } of entries.deletedUsers) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || isDeletedUser(user)) continue;
    try {
      await deleteAccount({ userId: id, uploadDir, now });
    } catch (error) {
      if (!isDomainError(error) || error.message !== TRANSFER_CAPTAIN_FIRST) throw error;
      // Captain with members here, but deleted in the old database: the role had been handed over
      // after the backup. The longest-standing member takes it, then the deletion goes through.
      if (await transferToLongestMember(id)) report.transferredCaptains++;
      await deleteAccount({ userId: id, uploadDir, now });
    }
    report.deletedUsers++;
  }
  return report;
}

/** False if the user is no longer captain of a team with members; then nothing is changed. */
async function transferToLongestMember(userId: string): Promise<boolean> {
  const team = await findOwnTeam(userId);
  if (!team || !isCaptainOf({ id: userId }, team)) return false;
  const successor = await prisma.teamMember.findFirst({
    where: { teamId: team.id, userId: { not: userId } },
    orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
  });
  if (!successor) return false;
  await transferCaptain({ userId, teamId: team.id, newCaptainId: successor.userId });
  return true;
}
