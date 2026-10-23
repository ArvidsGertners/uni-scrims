// Staff roles (SPEC N-4, ARCHITECTURE §5.9): the operator, set by a script, makes existing accounts
// admins or reviewers. Every change ends the person's sessions, so it applies at once and the next
// login goes through password and code.
import { type Prisma, StaffRole, prisma } from "@uni-scrims/db";
import type { Db } from "./db.ts";
import { DomainError } from "./errors.ts";
import { lockUser } from "./locks.ts";
import { requireOperator, requireStaffMember } from "./permissions.ts";
import { emailSchema } from "./schemas.ts";
import { CREDENTIAL_PROVIDER } from "./account.ts";
import { DISCORD_PROVIDER, accountSetupStep, isDeletedUser } from "./users.ts";

/** Roles the operator assigns in the UI; the operator role only comes from the script. */
export const ASSIGNABLE_STAFF_ROLES = [StaffRole.ADMIN, StaffRole.REVIEWER] as const;
export type AssignableStaffRole = (typeof ASSIGNABLE_STAFF_ROLES)[number];

export const MIN_STAFF_SEARCH_LENGTH = 3;
const MAX_STAFF_RESULTS = 20;

const staffSelect = {
  id: true,
  name: true,
  firstName: true,
  lastName: true,
  email: true,
  staffRole: true,
  twoFactorEnabled: true,
} satisfies Prisma.UserSelect;

/** What keeps an account from a role: it must be complete, unbanned and have a password. */
async function staffCandidateProblem(userId: string, db: Db): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      emailVerified: true,
      bannedAt: true,
      deletedAt: true,
      accounts: { select: { providerId: true } },
    },
  });
  if (!user || user.deletedAt || isDeletedUser(user)) return "Konto nicht gefunden.";
  if (user.bannedAt) return "Das Konto ist gesperrt.";
  const providers = user.accounts.map((account) => account.providerId);
  if (accountSetupStep(user, providers.includes(DISCORD_PROVIDER))) {
    return "Das Konto ist noch nicht vollständig eingerichtet.";
  }
  if (!providers.includes(CREDENTIAL_PROVIDER)) return "Das Konto hat noch kein Passwort.";
  return null;
}

/** Ends every session and removes the 2FA of a user; in the caller's transaction (§5.9). */
async function endSessions(tx: Prisma.TransactionClient, userId: string, removeTwoFactor: boolean) {
  await tx.session.deleteMany({ where: { userId } });
  if (removeTwoFactor) {
    await tx.twoFactor.deleteMany({ where: { userId } });
    await tx.user.update({ where: { id: userId }, data: { twoFactorEnabled: false } });
  }
}

/** The roles page: everyone with a role, operators first. */
export async function listStaff(operatorId: string) {
  await requireOperator(operatorId);
  const staff = await prisma.user.findMany({
    where: { staffRole: { not: null } },
    orderBy: [{ staffRole: "asc" }, { name: "asc" }],
    select: staffSelect,
  });
  return staff.map((user) => ({ ...user, staffRole: user.staffRole! }));
}

/**
 * Accounts that can get a role: by exact address, or by Discord name (contains, at least 3
 * characters). Incomplete, banned and deleted accounts and accounts without password are left out.
 */
export async function findStaffCandidates(input: { operatorId: string; query: string }) {
  await requireOperator(input.operatorId);
  const query = input.query.trim();
  if (query.length < MIN_STAFF_SEARCH_LENGTH) return [];
  const email = emailSchema.safeParse(query);
  const found = await prisma.user.findMany({
    where: {
      bannedAt: null,
      deletedAt: null,
      firstName: { not: null },
      emailVerified: true,
      // A password and a Discord link, like every complete account since Phase 7.
      AND: [
        { accounts: { some: { providerId: CREDENTIAL_PROVIDER } } },
        { accounts: { some: { providerId: DISCORD_PROVIDER } } },
      ],
      ...(email.success
        ? { email: email.data }
        : { name: { contains: query, mode: "insensitive" as const } }),
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: MAX_STAFF_RESULTS,
    select: staffSelect,
  });
  return found;
}

/**
 * Makes an account admin or reviewer, changes or removes the role (role null). Not for the operator
 * itself, nor for operators. Ends the person's sessions; a removal also removes the 2FA, so the
 * person logs in like everyone else again.
 */
export async function setStaffRole(input: {
  operatorId: string;
  userId: string;
  role: AssignableStaffRole | null;
}): Promise<void> {
  const operator = await requireOperator(input.operatorId);
  if (input.role !== null && !ASSIGNABLE_STAFF_ROLES.includes(input.role)) {
    throw new DomainError("INVALID", "Unbekannte Rolle.");
  }
  if (input.userId === operator.id) {
    throw new DomainError("INVALID", "Deine eigene Rolle änderst du hier nicht.");
  }
  await prisma.$transaction(async (tx) => {
    // Both user rows in id order (§4); the operator is checked again under its lock.
    for (const id of [operator.id, input.userId].sort()) await lockUser(tx, id);
    await requireOperator(operator.id, tx);
    const target = await tx.user.findUnique({
      where: { id: input.userId },
      select: { staffRole: true },
    });
    if (target?.staffRole === StaffRole.OPERATOR) {
      throw new DomainError("CONFLICT", "Den Betreiber änderst du hier nicht.");
    }
    if (input.role !== null) {
      const problem = await staffCandidateProblem(input.userId, tx);
      if (problem) throw new DomainError("CONFLICT", problem);
    } else if (!target?.staffRole) {
      throw new DomainError("NOT_FOUND", "Das Konto hat keine Rolle.");
    }
    if (target?.staffRole === input.role) return;
    await tx.user.update({ where: { id: input.userId }, data: { staffRole: input.role } });
    await endSessions(tx, input.userId, input.role === null);
  });
}

/** For a lost device: the person sets the 2FA up again at the next visit of the admin area. */
export async function resetStaffTwoFactor(input: { operatorId: string; userId: string }) {
  const operator = await requireOperator(input.operatorId);
  if (input.userId === operator.id) {
    throw new DomainError("INVALID", "Deine eigene 2FA setzt du per README zurück.");
  }
  await prisma.$transaction(async (tx) => {
    for (const id of [operator.id, input.userId].sort()) await lockUser(tx, id);
    await requireOperator(operator.id, tx);
    const target = await tx.user.findUnique({
      where: { id: input.userId },
      select: { staffRole: true },
    });
    if (!target?.staffRole || target.staffRole === StaffRole.OPERATOR) {
      throw new DomainError("NOT_FOUND", "Das Konto hat keine Rolle, die du ändern kannst.");
    }
    await endSessions(tx, input.userId, true);
  });
}

/**
 * The operator, from the server script only (no permission check): a complete account with
 * password, by address. Ends its sessions, so the next login goes through the 2FA setup.
 */
export async function setOperator(email: string) {
  const address = emailSchema.safeParse(email);
  const user = address.success
    ? await prisma.user.findFirst({ where: { email: address.data }, select: { id: true } })
    : null;
  if (!user) throw new DomainError("NOT_FOUND", "Kein Konto mit dieser E-Mail-Adresse.");
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, user.id);
    const problem = await staffCandidateProblem(user.id, tx);
    if (problem) throw new DomainError("CONFLICT", problem);
    const updated = await tx.user.update({
      where: { id: user.id },
      data: { staffRole: StaffRole.OPERATOR },
      select: staffSelect,
    });
    await endSessions(tx, user.id, false);
    return updated;
  });
}

/**
 * Staff log in with password and code only (§5.9): Better Auth asks for the code on the password
 * login but not on a Discord login, so a session from Discord is refused for them.
 */
export async function discordLoginBlocked(userId: string, db: Db = prisma): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { staffRole: true } });
  return !!user?.staffRole;
}

/**
 * After the 2FA was set up: every session ends, so the next login goes through password and code
 * (§5.9). For the signed-in staff member only.
 */
export async function finishTwoFactorSetup(userId: string): Promise<void> {
  const user = await requireStaffMember(userId);
  if (!user.twoFactorEnabled) {
    throw new DomainError("CONFLICT", "Die Zwei-Faktor-Anmeldung ist noch nicht eingerichtet.");
  }
  await prisma.session.deleteMany({ where: { userId: user.id } });
}
