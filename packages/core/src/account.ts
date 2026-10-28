// Account deletion (SPEC P0-10, ARCHITECTURE §4, §5.5). The user row is anonymized instead of
// deleted, so past scrims keep their teams and the team statistics stay right.
import { randomUUID } from "node:crypto";
import { VerifStatus, prisma } from "@uni-scrims/db";
import { isUniqueViolation } from "./db.ts";
import { DomainError } from "./errors.ts";
import { type Message } from "./i18n/render.ts";
import { toDbLocale } from "./i18n/locale.ts";
import { lockTeam, lockUser } from "./locks.ts";
import { type ConversationKey, conversationKeyOf } from "./messages.ts";
import {
  findOwnTeams,
  isCaptainOf,
  requireAccountUser,
  requireActiveAccountUser,
  requireUser,
} from "./permissions.ts";
import {
  emailSchema,
  parseInput,
  playerRankSchema,
  realNameSchema,
  localeSchema,
  themePreferenceSchema,
} from "./schemas.ts";
import {
  TRANSFER_CAPTAIN_FIRST,
  dissolveTeam,
  lockRetirements,
  needsCaptainVerification,
} from "./teams.ts";
import { deleteUpload } from "./uploads.ts";
import { avatarVersion } from "./users.ts";
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
  notDeletedUserWhere,
} from "./users.ts";
import type { Locale } from "../config/locale.ts";
import { WHATS_NEW_EDITION } from "../config/whats-new.ts";

/** Better Auth's provider ID for the email and password login (§5.8). */
export const CREDENTIAL_PROVIDER = "credential";

const NAME_LOCKED = "nameLocked";

function emailTaken(): DomainError {
  return new DomainError("CONFLICT", "emailTaken");
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
): Message | null {
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
  const ownTeams = await findOwnTeams(user.id);
  const [memberCounts, student, discordId, credential] = await Promise.all([
    Promise.all(ownTeams.map((team) => prisma.teamMember.count({ where: { teamId: team.id } }))),
    readStudentStatus(user),
    getDiscordId(user.id),
    prisma.account.findFirst({
      where: { userId: user.id, providerId: CREDENTIAL_PROVIDER },
      select: { id: true },
    }),
  ]);
  const latestStatus = student.latest?.status;
  // Each team on its own (SPEC N-17): the role must be handed over in every team that blocks.
  const blocking = ownTeams.filter((team, index) =>
    accountDeletionProblem(user, team, memberCounts[index]!),
  );
  const deletionProblem = blocking.length > 0 ? TRANSFER_CAPTAIN_FIRST : null;
  const setupStep = accountSetupStep(user, discordId !== null);
  return {
    name: user.name,
    /** Version of the avatar copy for its URL, null without one (§5.12). */
    avatarVersion: avatarVersion(user),
    banned: user.bannedAt !== null,
    /** What the account still lacks (§5.8), or null. */
    setupStep,
    firstName: user.firstName,
    lastName: user.lastName,
    /** The placeholder of an account from before Phase 7 is not shown. */
    email: user.firstName ? user.email : null,
    hasDiscord: discordId !== null,
    hasPassword: credential !== null,
    /** The own rank, self-declared (SPEC N-16). */
    rank: user.rank,
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
    /** The warning dot: unverified captain of an active team (SPEC N-21). */
    verificationNeeded: needsCaptainVerification(user, ownTeams),
    /** All own teams (SPEC N-17); a captain's team is dissolved by the deletion, others are left. */
    teams: ownTeams.map((team) => ({
      id: team.id,
      name: team.name,
      isCaptain: isCaptainOf(user, team),
      blocksDeletion: blocking.includes(team),
    })),
    /** null if the account can be deleted now, otherwise why not. */
    deletionProblem,
    /**
     * Who can take over the captain role from the account page, per blocking team: only while the
     * account is incomplete, since the team page needs a complete account.
     */
    captainHandovers: setupStep
      ? await Promise.all(
          blocking.map(async (team) => ({
            teamId: team.id,
            teamName: team.name,
            candidates: await prisma.teamMember
              .findMany({
                where: { teamId: team.id, userId: { not: user.id } },
                orderBy: { joinedAt: "asc" },
                select: { user: { select: { id: true, name: true } } },
              })
              .then((rows) => rows.map((row) => row.user)),
          })),
        )
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
        throw new DomainError("CONFLICT", "accountAlreadyComplete");
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
      throw new DomainError("CONFLICT", "completeAccountFirst");
    }
    const pending = await tx.verificationRequest.findUnique({ where: { pendingUserId: user.id } });
    if (realNameLocked(current, pending !== null)) throw new DomainError("CONFLICT", NAME_LOCKED);
    await tx.user.update({ where: { id: user.id }, data: name });
  });
}

/**
 * The design of the own account (SPEC N-13, §5.16); banned users and incomplete accounts included,
 * like the account page itself.
 */
export async function setThemePreference(input: { userId: string; theme: string }): Promise<void> {
  const user = await requireAccountUser(input.userId);
  const theme = parseInput(themePreferenceSchema, input.theme);
  // updateMany: a deletion that commits meanwhile has reset the row, which then stays as it is.
  await prisma.user.updateMany({ where: notDeletedUserWhere(user.id), data: { theme } });
}

/**
 * The user closed the what's new dialog (SPEC N-29, §5.31): only the current edition, so a stale
 * page cannot mark a newer one as seen. Like the other settings of the own account.
 */
export async function markWhatsNewSeen(input: { userId: string; edition: string }): Promise<void> {
  const user = await requireUser(input.userId);
  if (input.edition !== WHATS_NEW_EDITION) throw new DomainError("INVALID", "invalidInput");
  // updateMany: a deletion that commits meanwhile has reset the row, which then stays as it is.
  await prisma.user.updateMany({
    where: notDeletedUserWhere(user.id),
    data: { whatsNewSeen: WHATS_NEW_EDITION },
  });
}

/**
 * The language of the own account (SPEC N-18, §5.21); banned users and incomplete accounts included,
 * like the design. Signed out, the language only lives in the cookie.
 */
export async function setLocalePreference(input: {
  userId: string;
  locale: string;
}): Promise<void> {
  const user = await requireAccountUser(input.userId);
  const locale = toDbLocale(parseInput(localeSchema, input.locale));
  // updateMany: a deletion that commits meanwhile has reset the row, which then stays as it is.
  await prisma.user.updateMany({ where: notDeletedUserWhere(user.id), data: { locale } });
}

/**
 * The language of an account that has none yet, from the page it signs in on (SPEC N-19, §5.22).
 * Never overwrites a stored language, which only the choice in the menu changes. No permission
 * check: called by the sign-in itself, like the other login steps.
 */
export async function adoptLocale(input: { userId: string; locale: Locale }): Promise<void> {
  await prisma.user.updateMany({
    where: { ...notDeletedUserWhere(input.userId), locale: null },
    data: { locale: toDbLocale(input.locale) },
  });
}

/**
 * The own rank (SPEC N-16, §5.19): active, complete accounts only, as it only counts in a team.
 * No lock: the team rank is computed when read, and being out of range is only a hint.
 */
export async function setPlayerRank(input: { userId: string; rank: string }): Promise<void> {
  const user = await requireUser(input.userId);
  const rank = parseInput(playerRankSchema, input.rank);
  // As setThemePreference: a deletion that commits meanwhile has reset the row and keeps it so;
  // a ban that commits meanwhile is seen here too (banned accounts set no rank).
  await prisma.user.updateMany({
    where: { ...notDeletedUserWhere(user.id), bannedAt: null },
    data: { rank },
  });
}

/**
 * Deletes all personal data: memberships, verification requests and their files, notes, messages to
 * other teams, notifications to the user, sessions and the Discord link; name, email and avatar are
 * replaced, deletedAt is set. For a banned user the Discord account row moves to a new ban
 * placeholder (§4), so a new login lands on a banned user again, without any link to the deleted
 * account's data. Returns the threads that lost messages, for the live threads (§5.30).
 */
export async function deleteAccount(input: {
  userId: string;
  uploadDir: string;
  now: Date;
}): Promise<{ conversations: ConversationKey[] }> {
  const user = await requireAccountUser(input.userId);
  const { files, conversations } = await prisma.$transaction(async (tx) => {
    // Teams before user (§4), in id order, as in leaveTeam, joinTeam and banUser, so they cannot
    // deadlock.
    const lockedIds = (await findOwnTeams(user.id, tx)).map((team) => team.id).sort();
    for (const id of lockedIds) await lockTeam(tx, id);

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
    const teams = await findOwnTeams(user.id, tx);
    if (teams.some((team) => !lockedIds.includes(team.id))) {
      // Joined another team in between; that one is not locked.
      throw new DomainError("CONFLICT", "tryAgain");
    }
    // Teams the user captains are dissolved, the others are left (SPEC N-17).
    const dissolved: string[] = [];
    for (const team of teams) {
      const memberCount = await tx.teamMember.count({ where: { teamId: team.id } });
      const problem = accountDeletionProblem(user, team, memberCount);
      if (problem) throw new DomainError("CONFLICT", problem);
      if (isCaptainOf(user, team)) dissolved.push(team.id);
    }

    // Requests next, all in id order, then the scrims of the dissolved teams (§4): requests with a
    // note by the user and those the dissolutions retire. The note is free text the user wrote,
    // often with contact details. Application messages have no author and stay with the team.
    const noted = await tx.scrimRequest.findMany({
      where: { createdById: user.id, note: { not: null } },
      select: { id: true },
    });
    const notedIds = noted.map(({ id }) => id);
    await lockRetirements(tx, dissolved, input.now, notedIds);
    await tx.scrimRequest.updateMany({ where: { id: { in: notedIds } }, data: { note: null } });
    // The same for the user's weekly series, also in teams the user has left (SPEC N-25). Their
    // next requests copy the note; postSeriesRequests locks this user row before reading it (§5.27).
    await tx.requestSeries.updateMany({
      where: { createdById: user.id, note: { not: null } },
      data: { note: null },
    });
    for (const team of teams) {
      if (dissolved.includes(team.id)) {
        await dissolveTeam(team.id, input.now, tx);
      } else {
        await tx.teamMember.deleteMany({ where: { teamId: team.id, userId: user.id } });
      }
    }
    // Requests for more teams hold free text (SPEC N-17).
    await tx.teamLimitRequest.deleteMany({ where: { userId: user.id } });
    // Messages to other teams and the read state (SPEC N-28); reports on them go with them
    // (cascade), the reports the user made stay with the anonymized account, like feedback.
    const authored = await tx.message.findMany({
      where: { authorId: user.id },
      select: { conversation: { select: { requestId: true, guestTeamId: true } } },
    });
    await tx.message.deleteMany({ where: { authorId: user.id } });
    await tx.conversationRead.deleteMany({ where: { userId: user.id } });

    const verifications = await tx.verificationRequest.findMany({
      where: { userId: user.id },
      select: { filePath: true },
    });
    await tx.verificationRequest.deleteMany({ where: { userId: user.id } });
    // The copy of the Discord avatar goes with the account (SPEC N-8).
    await tx.userAvatar.deleteMany({ where: { userId: user.id } });
    await tx.notification.deleteMany({ where: { targetUserId: user.id } });
    await tx.notificationPreference.deleteMany({ where: { userId: user.id } });
    // The bell (§5.34).
    await tx.inboxItem.deleteMany({ where: { userId: user.id } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    // Better Auth keeps password reset tokens with the user ID as value; an open link would
    // otherwise set a new password on the anonymized account (§5.8).
    await tx.verification.deleteMany({ where: { value: user.id } });
    // The TOTP secret and backup codes of a role (§5.9).
    await tx.twoFactor.deleteMany({ where: { userId: user.id } });
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
    return {
      files: verifications.flatMap(({ filePath }) => (filePath ? [filePath] : [])),
      conversations: [
        ...new Map(
          authored.map(({ conversation }) => [conversationKeyOf(conversation), conversation]),
        ).values(),
      ],
    };
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
  return { conversations };
}
