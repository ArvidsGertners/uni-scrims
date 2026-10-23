// Account deletion (SPEC P0-10, ARCHITECTURE §4, §5.5). The user row is anonymized instead of
// deleted, so past scrims keep their teams and the team statistics stay right.
import { randomUUID } from "node:crypto";
import { prisma } from "@uni-scrims/db";
import { DomainError } from "./errors.ts";
import { lockRequest, lockTeam } from "./locks.ts";
import { findOwnTeam, isCaptainOf, requireAccountUser } from "./permissions.ts";
import { TRANSFER_CAPTAIN_FIRST, dissolveTeam, retirementRequestIds } from "./teams.ts";
import { deleteUpload } from "./uploads.ts";
import { DISCORD_PROVIDER, NO_OAUTH_TOKENS, banPlaceholderData, deletedUserData } from "./users.ts";

/**
 * Why the account cannot be deleted right now, or null. Only the captain of a team that is not
 * banned and has further members must hand over the role first. A banned team cannot do that and is
 * dissolved instead, so banned captains can always delete their account.
 */
export function accountDeletionProblem(
  user: { id: string },
  team: { captainId: string; bannedAt: Date | null } | null,
  memberCount: number,
): string | null {
  if (!team || !isCaptainOf(user, team) || team.bannedAt || memberCount <= 1) return null;
  return TRANSFER_CAPTAIN_FIRST;
}

/** The account page; banned users included, they may delete their account too (§7). */
export async function getAccount(userId: string) {
  const user = await requireAccountUser(userId);
  const team = await findOwnTeam(user.id);
  const memberCount = team ? await prisma.teamMember.count({ where: { teamId: team.id } }) : 0;
  return {
    name: user.name,
    image: user.image,
    banned: user.bannedAt !== null,
    team: team ? { name: team.name, isCaptain: isCaptainOf(user, team) } : null,
    /** null if the account can be deleted now, otherwise why not. */
    deletionProblem: accountDeletionProblem(user, team, memberCount),
  };
}

/**
 * Deletes all personal data: memberships, verification requests and their files, notes, notifications
 * to the user, sessions and the Discord link; name, email and avatar are replaced, deletedAt is set.
 * For a banned user the Discord account row moves to a new ban placeholder (§4), so a new login lands
 * on a banned user again, without any link to the deleted account's data.
 */
export async function deleteAccount(input: {
  userId: string;
  uploadDir: string;
  now: Date;
}): Promise<void> {
  const user = await requireAccountUser(input.userId);
  const files = await prisma.$transaction(async (tx) => {
    // Team before user (§4), in the same order as leaveTeam, joinTeam and banUser, so they cannot
    // deadlock.
    const ownTeam = await findOwnTeam(user.id, tx);
    if (ownTeam) await lockTeam(tx, ownTeam.id);

    // Updating first locks the user row; bannedAt and deletedAt are then the committed state, so a
    // ban that lands meanwhile cannot be dodged by deleting the Discord link, and a second deletion
    // that waited for this one finds the work done.
    const { bannedAt, deletedAt } = await tx.user.update({
      where: { id: user.id },
      data: deletedUserData(user.id),
      select: { bannedAt: true, deletedAt: true },
    });
    if (!deletedAt) {
      await tx.user.update({ where: { id: user.id }, data: { deletedAt: input.now } });
    }

    // Read again under the lock: the role or the members may have changed meanwhile.
    const team = await findOwnTeam(user.id, tx);
    if (team && team.id !== ownTeam?.id) {
      // Joined another team in between; that one is not locked.
      throw new DomainError("CONFLICT", "Bitte versuch es erneut.");
    }
    let dissolve = false;
    if (team) {
      const memberCount = await tx.teamMember.count({ where: { teamId: team.id } });
      const problem = accountDeletionProblem(user, team, memberCount);
      if (problem) throw new DomainError("CONFLICT", problem);
      dissolve = isCaptainOf(user, team);
    }

    // Requests next, all in id order (§4): those with a note by the user and those the dissolution
    // retires. The note is free text the user wrote, often with contact details. Application
    // messages have no author and stay with the team.
    const noted = await tx.scrimRequest.findMany({
      where: { createdById: user.id, note: { not: null } },
      select: { id: true },
    });
    const notedIds = noted.map(({ id }) => id);
    const retired = team && dissolve ? await retirementRequestIds(team.id, input.now, tx) : [];
    for (const id of [...new Set([...notedIds, ...retired])].sort()) await lockRequest(tx, id);
    await tx.scrimRequest.updateMany({ where: { id: { in: notedIds } }, data: { note: null } });
    if (team && dissolve) {
      await dissolveTeam(team.id, input.now, tx);
    } else if (team) {
      await tx.teamMember.deleteMany({ where: { teamId: team.id, userId: user.id } });
    }

    const verifications = await tx.verificationRequest.findMany({
      where: { userId: user.id },
      select: { filePath: true },
    });
    await tx.verificationRequest.deleteMany({ where: { userId: user.id } });
    await tx.notification.deleteMany({ where: { targetUserId: user.id } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    // Only the Discord ID stays with a ban, so it still applies after a new login (§4).
    const discordOnly = { ...NO_OAUTH_TOKENS, scope: null };
    if (bannedAt && deletedAt) {
      // Already the ban placeholder of an earlier deletion, logged in again: it holds nothing but
      // the Discord ID besides what the login wrote, so it is anonymized in place.
      await tx.account.updateMany({
        where: { userId: user.id, providerId: DISCORD_PROVIDER },
        data: discordOnly,
      });
      await tx.account.deleteMany({
        where: { userId: user.id, providerId: { not: DISCORD_PROVIDER } },
      });
    } else {
      if (bannedAt) {
        // The ban moves to a placeholder with the Discord account row; this account is then as
        // anonymous as any deleted one, with no link from its past data to the Discord ID.
        const placeholder = await tx.user.create({
          data: banPlaceholderData(randomUUID(), bannedAt, input.now),
        });
        await tx.account.updateMany({
          where: { userId: user.id, providerId: DISCORD_PROVIDER },
          data: { ...discordOnly, userId: placeholder.id },
        });
      }
      await tx.account.deleteMany({ where: { userId: user.id } });
    }
    return verifications.flatMap(({ filePath }) => (filePath ? [filePath] : []));
  });
  // After the commit, as in decideVerification. The account is already deleted, so a failure is
  // only logged; the janitor's orphan step removes leftovers.
  for (const file of files) {
    try {
      await deleteUpload(input.uploadDir, file);
    } catch (error) {
      console.error(`Could not delete upload ${file} of a deleted account`, error);
    }
  }
}
