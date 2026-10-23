// After restoring a database backup (ARCHITECTURE §8, README): bans and account deletions made after
// the backup are missing from the restored database. They are exported from the old database while
// it is still readable and applied again here. Operations only; no permission check, no web caller.
import { randomUUID } from "node:crypto";
import { StaffRole, prisma } from "@uni-scrims/db";
import { z } from "zod";
import { deleteAccount } from "./account.ts";
import { isDomainError } from "./errors.ts";
import { banTeamInTx, banUserInTx } from "./moderation.ts";
import { lockUser } from "./locks.ts";
import { findOwnTeam, isCaptainOf } from "./permissions.ts";
import { endStaffSessions } from "./staff.ts";
import { TRANSFER_CAPTAIN_FIRST, handOverCaptain, leaveTeam } from "./teams.ts";
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
  /** Every account with a role in the old database (Phase 8, §5.9). */
  staff: z.array(z.object({ id: z.string().min(1), role: z.enum(StaffRole) })),
});
export type ModerationExport = z.infer<typeof moderationExportSchema>;

export type ReapplyReport = {
  bannedTeams: number;
  bannedUsers: number;
  /** Banned in the old database, unknown in the restored one: kept as a banned, deleted user. */
  bannedPlaceholders: number;
  deletedUsers: number;
  /**
   * Captains here, but no longer in the old database when they were banned or deleted: the role went
   * to the longest-standing member first.
   */
  transferredCaptains: number;
  /** Banned ex-captains who were the only member here: they left, which dissolved the team. */
  leftTeams: number;
  /** Accounts whose role differed here and was set as in the old database (§5.9). */
  staffRoles: number;
  /**
   * Accounts whose 2FA came back with the backup: removed, so no secret reset after the backup
   * works again; staff set it up anew at the next login (§5.9).
   */
  twoFactorResets: number;
};

/**
 * Applies roles, bans and deletions again, in this order: roles, teams, users, deletions. Roles come
 * first: a ban needs an account without a role, and a role removed after the backup must not come
 * back (§5.9). Every 2FA is reset with them. A banned user who also deleted the account ends up banned and deleted, as in the old
 * database. The export contains every banned team, dissolved ones too, so a team banned and then
 * dissolved in the old database is banned here before its captain's deletion dissolves it again.
 * Idempotent: what the restored database already has is skipped, so a second run changes nothing.
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
    leftTeams: 0,
    staffRoles: 0,
    twoFactorResets: 0,
  };

  const roles = new Map(entries.staff.map(({ id, role }) => [id, role]));
  const withRoles = await prisma.user.findMany({
    where: { OR: [{ staffRole: { not: null } }, { id: { in: [...roles.keys()] } }] },
    select: { id: true, staffRole: true },
  });
  for (const user of withRoles) {
    const role = roles.get(user.id) ?? null;
    if (user.staffRole === role) continue;
    await prisma.$transaction(async (tx) => {
      await lockUser(tx, user.id);
      await tx.user.update({ where: { id: user.id }, data: { staffRole: role } });
      // As for any role change (§5.9): sessions end, and without a role the 2FA goes too.
      await endStaffSessions(tx, user.id, role === null);
    });
    report.staffRoles++;
  }

  // The export holds no secrets, so the restored ones may be outdated (a lost device reset after
  // the backup); every 2FA is set up again. A second run finds none of them any more.
  const withTwoFactor = await prisma.user.findMany({
    where: { OR: [{ twoFactorEnabled: true }, { twoFactors: { some: {} } }] },
    select: { id: true },
  });
  for (const { id } of withTwoFactor) {
    await prisma.$transaction(async (tx) => {
      await lockUser(tx, id);
      await endStaffSessions(tx, id, true);
    });
    report.twoFactorResets++;
  }

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
      const team = await findOwnTeam(user.id);
      if (team && isCaptainOf(user, team) && !team.bannedAt) {
        // Captain here, but the team is not banned after the first loop: in the old database a ban
        // of its captain would have banned it, so the role had been handed over (or the team left)
        // after the backup, and only the player was banned. As there, the ban must not hit the team.
        if (await transferToLongestMember(user.id)) {
          report.transferredCaptains++;
        } else {
          await leaveTeam({ userId: user.id, now });
          report.leftTeams++;
        }
      }
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
  // handOverCaptain, as the captain may be an account from before Phase 7 (§5.8).
  await handOverCaptain({ userId, newCaptainId: successor.userId });
  return true;
}
