// Account deletion (SPEC P0-10, ARCHITECTURE §4, §5.5). The user row is anonymized instead of
// deleted, so past scrims keep their teams and the team statistics stay right.
import { prisma } from "@uni-scrims/db";
import { DomainError } from "./errors.ts";
import { lockTeam } from "./locks.ts";
import { findOwnTeam, isCaptainOf, requireAccountUser } from "./permissions.ts";
import { TRANSFER_CAPTAIN_FIRST, dissolveTeam } from "./teams.ts";
import { deleteUpload } from "./uploads.ts";
import { DISCORD_PROVIDER, clearOAuthTokens } from "./users.ts";

export const DELETED_USER_NAME = "Gelöschter Nutzer";

/**
 * A new placeholder instead of `<discordId>@…`: email is unique, and a later login with the same
 * Discord account creates a new user with the original placeholder.
 */
export function deletedUserEmail(userId: string): string {
  return `deleted-${userId}@users.uniscrims.invalid`;
}

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
 * Deletes all personal data: memberships, verification requests and their files, notifications to
 * the user, sessions and the Discord link; name, email and avatar are replaced. A banned user keeps
 * the Discord account row without tokens and bannedAt, so a new login lands on the banned user again.
 */
export async function deleteAccount(input: {
  userId: string;
  uploadDir: string;
  now: Date;
}): Promise<void> {
  const user = await requireAccountUser(input.userId);
  const files = await prisma.$transaction(async (tx) => {
    // Team before user, in the same order as leaveTeam and banUser, so they cannot deadlock.
    const ownTeam = await findOwnTeam(user.id, tx);
    if (ownTeam) await lockTeam(tx, ownTeam.id);

    // Updating first locks the user row; bannedAt is then the committed state, so a ban that lands
    // meanwhile cannot be dodged by deleting the Discord link.
    const { bannedAt } = await tx.user.update({
      where: { id: user.id },
      data: {
        name: DELETED_USER_NAME,
        email: deletedUserEmail(user.id),
        image: null,
        universityId: null,
        universityOther: null,
        verifiedAt: null,
        hubJoinFailedAt: null,
        dmFailedAt: null,
      },
      select: { bannedAt: true },
    });

    // Read again under the lock: the role or the members may have changed meanwhile.
    const team = await findOwnTeam(user.id, tx);
    if (team && team.id !== ownTeam?.id) {
      // Joined another team in between; that one is not locked.
      throw new DomainError("CONFLICT", "Bitte versuch es erneut.");
    }
    if (team) {
      const memberCount = await tx.teamMember.count({ where: { teamId: team.id } });
      const problem = accountDeletionProblem(user, team, memberCount);
      if (problem) throw new DomainError("CONFLICT", problem);
      if (isCaptainOf(user, team)) {
        await dissolveTeam(team.id, input.now, tx);
      } else {
        await tx.teamMember.deleteMany({ where: { teamId: team.id, userId: user.id } });
      }
    }

    const verifications = await tx.verificationRequest.findMany({
      where: { userId: user.id },
      select: { filePath: true },
    });
    await tx.verificationRequest.deleteMany({ where: { userId: user.id } });
    await tx.notification.deleteMany({ where: { targetUserId: user.id } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    if (bannedAt) {
      // Only the Discord ID stays, so the ban still applies after a new login (§4).
      await tx.account.deleteMany({
        where: { userId: user.id, providerId: { not: DISCORD_PROVIDER } },
      });
      await clearOAuthTokens(user.id, tx);
    } else {
      await tx.account.deleteMany({ where: { userId: user.id } });
    }
    return verifications.flatMap(({ filePath }) => (filePath ? [filePath] : []));
  });
  // After the commit, as in decideVerification; leftovers are removed by the janitor's orphan step.
  for (const file of files) {
    await deleteUpload(input.uploadDir, file);
  }
}
