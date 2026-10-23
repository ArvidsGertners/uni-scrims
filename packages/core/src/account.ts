// Account deletion (SPEC P0-10, ARCHITECTURE §4, §5.5). The user row is anonymized instead of
// deleted, so past scrims keep their teams and the team statistics stay right.
import { randomUUID } from "node:crypto";
import { VerifStatus, prisma } from "@uni-scrims/db";
import { isUniqueViolation } from "./db.ts";
import { DomainError } from "./errors.ts";
import { lockRequest, lockTeam, lockUser } from "./locks.ts";
import {
  findOwnTeam,
  isCaptainOf,
  requireAccountUser,
  requireActiveAccountUser,
} from "./permissions.ts";
import { emailSchema, parseInput, realNameSchema } from "./schemas.ts";
import { TRANSFER_CAPTAIN_FIRST, dissolveTeam, retirementRequestIds } from "./teams.ts";
import { deleteUpload } from "./uploads.ts";
import {
  readStudentStatus,
  removeFilesAfterCommit,
  resetLegacyVerification,
} from "./verification.ts";
import {
  DISCORD_PROVIDER,
  NO_OAUTH_TOKENS,
  accountSetupStep,
  banPlaceholderData,
  deletedUserData,
  getDiscordId,
} from "./users.ts";

/** Better Auth's provider ID for the email and password login (§5.8). */
export const CREDENTIAL_PROVIDER = "credential";

const NAME_LOCKED =
  "Nach dem Hochladen der Bescheinigung kannst du deinen Namen nicht mehr selbst ändern. Schreib uns dafür eine Mail (Adresse im Impressum).";

function emailTaken(): DomainError {
  return new DomainError("CONFLICT", "Diese E-Mail-Adresse wird schon verwendet.");
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

/** The real name may change until the certificate is uploaded (SPEC N-3). */
function realNameLocked(user: { verifiedAt: Date | null }, hasPendingRequest: boolean): boolean {
  return user.verifiedAt !== null || hasPendingRequest;
}

/**
 * The account page; banned users and incomplete accounts included, they may delete their account
 * too (§7, §5.8).
 */
export async function getAccount(userId: string) {
  const user = await requireAccountUser(userId);
  const team = await findOwnTeam(user.id);
  const [memberCount, student, discordId, credential] = await Promise.all([
    team ? prisma.teamMember.count({ where: { teamId: team.id } }) : 0,
    readStudentStatus(user),
    getDiscordId(user.id),
    prisma.account.findFirst({
      where: { userId: user.id, providerId: CREDENTIAL_PROVIDER },
      select: { id: true },
    }),
  ]);
  const latestStatus = student.latest?.status;
  const deletionProblem = accountDeletionProblem(user, team, memberCount);
  const setupStep = accountSetupStep(user, discordId !== null);
  return {
    name: user.name,
    image: user.image,
    banned: user.bannedAt !== null,
    /** What the account still lacks (§5.8), or null. */
    setupStep,
    firstName: user.firstName,
    lastName: user.lastName,
    /** The placeholder of an account from before Phase 7 is not shown. */
    email: user.firstName ? user.email : null,
    hasDiscord: discordId !== null,
    hasPassword: credential !== null,
    canEditName: !!user.firstName && !realNameLocked(user, latestStatus === VerifStatus.PENDING),
    /** Student status for the account page: the verified university, else the latest request's. */
    verification: user.verifiedAt
      ? { status: "VERIFIED" as const, university: student.university }
      : {
          status:
            latestStatus === VerifStatus.PENDING
              ? ("PENDING" as const)
              : latestStatus === VerifStatus.REJECTED
                ? ("REJECTED" as const)
                : ("NONE" as const),
          university: student.latest?.university ?? null,
        },
    team: team ? { name: team.name, isCaptain: isCaptainOf(user, team) } : null,
    /** null if the account can be deleted now, otherwise why not. */
    deletionProblem,
    /**
     * Who can take over the captain role from the account page: only while the account is
     * incomplete and the role blocks the deletion, since the team page needs a complete account.
     */
    captainCandidates:
      team && deletionProblem && setupStep
        ? await prisma.teamMember
            .findMany({
              where: { teamId: team.id, userId: { not: user.id } },
              orderBy: { joinedAt: "asc" },
              select: { user: { select: { id: true, name: true } } },
            })
            .then((rows) => rows.map((row) => row.user))
        : [],
  };
}

/**
 * "Konto vervollständigen" for an account from before Phase 7 (§5.8): real name, a new address that
 * still has to be confirmed, and the password, whose hash the web computes with Better Auth. Its old
 * verification is taken back, as for the janitor (SPEC N-3). The caller then sends the confirmation
 * mail.
 */
export async function completeAccount(input: {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  uploadDir: string;
  now: Date;
}): Promise<{ email: string }> {
  const user = await requireActiveAccountUser(input.userId);
  const name = parseInput(realNameSchema, input);
  const email = parseInput(emailSchema, input.email);
  try {
    const rejected = await prisma.$transaction(async (tx) => {
      // The user row first (§4); a deletion or ban that commits meanwhile is seen here.
      await lockUser(tx, user.id);
      const current = await requireActiveAccountUser(user.id, tx);
      if (current.firstName) {
        throw new DomainError("CONFLICT", "Dein Konto ist bereits vollständig.");
      }
      await tx.user.update({
        where: { id: user.id },
        data: { ...name, email, emailVerified: false },
      });
      await tx.account.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          accountId: user.id,
          providerId: CREDENTIAL_PROVIDER,
          password: input.passwordHash,
        },
      });
      return resetLegacyVerification(tx, user.id, input.now);
    });
    if (rejected) await removeFilesAfterCommit([rejected], input.uploadDir);
    return { email };
  } catch (error) {
    if (isUniqueViolation(error)) throw emailTaken();
    throw error;
  }
}

/** The real name, as long as no certificate is uploaded (SPEC N-3); for complete accounts only. */
export async function updateRealName(input: {
  userId: string;
  firstName: string;
  lastName: string;
}) {
  const user = await requireActiveAccountUser(input.userId);
  const name = parseInput(realNameSchema, input);
  await prisma.$transaction(async (tx) => {
    // Under the user lock, as submitVerification: an upload that commits first locks the name.
    await lockUser(tx, user.id);
    const current = await requireActiveAccountUser(user.id, tx);
    if (!current.firstName) {
      throw new DomainError("CONFLICT", "Bitte vervollständige zuerst dein Konto.");
    }
    const pending = await tx.verificationRequest.findUnique({ where: { pendingUserId: user.id } });
    if (realNameLocked(current, pending !== null)) throw new DomainError("CONFLICT", NAME_LOCKED);
    await tx.user.update({ where: { id: user.id }, data: name });
  });
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
    // Better Auth keeps password reset tokens with the user ID as value; an open link would
    // otherwise set a new password on the anonymized account (§5.8).
    await tx.verification.deleteMany({ where: { value: user.id } });
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
