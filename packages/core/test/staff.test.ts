import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { StaffRole, VerifStatus, prisma } from "@uni-scrims/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CREDENTIAL_PROVIDER,
  banUser,
  decideVerification,
  deleteAccount,
  findStaffCandidates,
  finishTwoFactorSetup,
  hasStaffRole,
  isDomainError,
  listStaff,
  reapplyModeration,
  requireReviewer,
  resetStaffTwoFactor,
  setOperator,
  setStaffRole,
} from "../src/index.ts";
import { NOW, createSession, createUser, uid } from "./helpers.ts";

let uploadDir: string;
let operator: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
  uploadDir = await mkdtemp(path.join(tmpdir(), "uni-scrims-staff-"));
  operator = await createUser({ staffRole: StaffRole.OPERATOR });
  return () => rm(uploadDir, { recursive: true, force: true });
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A complete account with a password, the kind that can get a role (§5.9). */
async function candidate(options: Parameters<typeof createUser>[0] = {}) {
  const user = await createUser(options);
  const email = `staff.${uid()}@example.org`;
  await prisma.user.update({ where: { id: user.id }, data: { email } });
  await prisma.account.create({
    data: {
      id: uid(),
      userId: user.id,
      accountId: user.id,
      providerId: CREDENTIAL_PROVIDER,
      password: "hash",
    },
  });
  return { ...user, email };
}

async function twoFactorOf(userId: string) {
  await prisma.twoFactor.create({
    data: { id: uid(), userId, secret: "secret", backupCodes: "codes" },
  });
}

const role = async (userId: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).staffRole;

describe("setStaffRole", () => {
  it("makes an account a reviewer, changes and removes the role, each time ending its sessions", async () => {
    const user = await candidate();
    await createSession(user.id);
    await setStaffRole({ operatorId: operator.id, userId: user.id, role: StaffRole.REVIEWER });
    expect(await role(user.id)).toBe(StaffRole.REVIEWER);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await listStaff(operator.id)).toContainEqual(
      expect.objectContaining({ id: user.id, staffRole: StaffRole.REVIEWER, email: user.email }),
    );

    await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
    await twoFactorOf(user.id);
    await createSession(user.id);
    await setStaffRole({ operatorId: operator.id, userId: user.id, role: StaffRole.ADMIN });
    expect(await role(user.id)).toBe(StaffRole.ADMIN);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    // A change keeps the 2FA, a removal takes it away.
    expect(await prisma.twoFactor.count({ where: { userId: user.id } })).toBe(1);

    await setStaffRole({ operatorId: operator.id, userId: user.id, role: null });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      staffRole: null,
      twoFactorEnabled: false,
    });
    expect(await prisma.twoFactor.count({ where: { userId: user.id } })).toBe(0);
  });

  it("is for the operator only and never touches operators", async () => {
    const admin = await createUser({ staffRole: StaffRole.ADMIN });
    const user = await candidate();
    await expect(
      setStaffRole({ operatorId: admin.id, userId: user.id, role: StaffRole.REVIEWER }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      setStaffRole({ operatorId: operator.id, userId: operator.id, role: null }),
    ).rejects.toMatchObject({ code: "INVALID" });
    const other = await createUser({ staffRole: StaffRole.OPERATOR });
    await expect(
      setStaffRole({ operatorId: operator.id, userId: other.id, role: null }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      setStaffRole({ operatorId: operator.id, userId: user.id, role: "OPERATOR" as "ADMIN" }),
    ).rejects.toMatchObject({ code: "INVALID" });
  });

  it("refuses incomplete, banned and password-less accounts", async () => {
    const assign = (userId: string) =>
      setStaffRole({ operatorId: operator.id, userId, role: StaffRole.REVIEWER });
    await expect(assign((await candidate({ legacy: true })).id)).rejects.toMatchObject({
      message: "Das Konto ist noch nicht vollständig eingerichtet.",
    });
    await expect(assign((await candidate({ banned: true })).id)).rejects.toMatchObject({
      message: "Das Konto ist gesperrt.",
    });
    await expect(assign((await createUser()).id)).rejects.toMatchObject({
      message: "Das Konto hat noch kein Passwort.",
    });
  });
});

describe("findStaffCandidates", () => {
  it("finds complete accounts with a password by exact address or Discord name", async () => {
    const user = await candidate();
    const byEmail = await findStaffCandidates({ operatorId: operator.id, query: user.email });
    expect(byEmail.map(({ id }) => id)).toEqual([user.id]);
    const byName = await findStaffCandidates({
      operatorId: operator.id,
      query: user.name.slice(5, 13),
    });
    expect(byName.map(({ id }) => id)).toContain(user.id);
    // A partial address is no match; without a password the account is left out.
    expect(
      await findStaffCandidates({ operatorId: operator.id, query: user.email.slice(0, 10) }),
    ).toEqual([]);
    const noPassword = await createUser();
    expect(
      (await findStaffCandidates({ operatorId: operator.id, query: noPassword.name })).map(
        ({ id }) => id,
      ),
    ).not.toContain(noPassword.id);
  });
});

describe("resetStaffTwoFactor", () => {
  it("removes the 2FA and the sessions, keeping the role", async () => {
    const user = await candidate({ staffRole: StaffRole.ADMIN });
    await twoFactorOf(user.id);
    await createSession(user.id);
    await resetStaffTwoFactor({ operatorId: operator.id, userId: user.id });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      staffRole: StaffRole.ADMIN,
      twoFactorEnabled: false,
    });
    expect(await prisma.twoFactor.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    await expect(requireReviewer(user.id)).rejects.toMatchObject({ code: "TWO_FACTOR_REQUIRED" });
  });
});

describe("setOperator (script)", () => {
  it("makes a complete account with a password the operator and ends its sessions", async () => {
    const user = await candidate();
    await createSession(user.id);
    await expect(setOperator(user.email.toUpperCase())).resolves.toMatchObject({
      id: user.id,
      staffRole: StaffRole.OPERATOR,
    });
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    await expect(setOperator("niemand@example.org")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const incomplete = await candidate({ legacy: true });
    await expect(setOperator(incomplete.email)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("staff logins and the 2FA setup", () => {
  it("tells staff apart, whose sessions come from password and code only", async () => {
    expect(await hasStaffRole((await createUser()).id)).toBe(false);
    expect(await hasStaffRole(operator.id)).toBe(true);
  });

  it("ends every session once the 2FA is on", async () => {
    const user = await candidate({ staffRole: StaffRole.REVIEWER, twoFactor: false });
    await twoFactorOf(user.id);
    await createSession(user.id);
    expect(await finishTwoFactorSetup(user.id)).toBe(false);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
    expect(await finishTwoFactorSetup(user.id)).toBe(true);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.twoFactor.count({ where: { userId: user.id } })).toBe(1);
  });

  it("switches a 2FA off that came on after the role was removed or the 2FA reset", async () => {
    // Better Auth set the flag after setStaffRole(null) or resetStaffTwoFactor had run.
    const withoutRole = await candidate({ twoFactor: false });
    const withoutSecret = await candidate({ staffRole: StaffRole.ADMIN });
    for (const user of [withoutRole, withoutSecret]) {
      await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
      await createSession(user.id);
    }
    await twoFactorOf(withoutRole.id);
    for (const user of [withoutRole, withoutSecret]) {
      expect(await finishTwoFactorSetup(user.id)).toBe(false);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
        twoFactorEnabled: false,
      });
      expect(await prisma.twoFactor.count({ where: { userId: user.id } })).toBe(0);
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    }
  });
});

describe("bans and deletions of staff", () => {
  it("refuses to ban an account with a role", async () => {
    const admin = await createUser({ staffRole: StaffRole.ADMIN });
    const reviewer = await createUser({ staffRole: StaffRole.REVIEWER });
    await expect(
      banUser({ adminId: admin.id, userId: reviewer.id, uploadDir, now: NOW }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: reviewer.id } })).bannedAt).toBe(
      null,
    );
  });

  it("deletes role and 2FA with the account", async () => {
    const reviewer = await createUser({ staffRole: StaffRole.REVIEWER });
    await twoFactorOf(reviewer.id);
    await deleteAccount({ userId: reviewer.id, uploadDir, now: NOW });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: reviewer.id } })).toMatchObject({
      staffRole: null,
      twoFactorEnabled: false,
    });
    expect(await prisma.twoFactor.count({ where: { userId: reviewer.id } })).toBe(0);
  });
});

describe("reapplyModeration and roles", () => {
  it("sets the roles of the old database, removed ones included, and resets every 2FA", async () => {
    const kept = await createUser({ staffRole: StaffRole.ADMIN });
    await twoFactorOf(kept.id);
    await createSession(kept.id);
    // Removed after the backup: the restored database still has it.
    const removed = await createUser({ staffRole: StaffRole.REVIEWER });
    await twoFactorOf(removed.id);
    // Changed after the backup.
    const changed = await createUser({ staffRole: StaffRole.REVIEWER });
    const empty = { bannedTeams: [], bannedUsers: [], deletedUsers: [] };
    const others = (await prisma.user.findMany({ where: { staffRole: { not: null } } }))
      .filter(({ id }) => ![kept.id, removed.id, changed.id].includes(id))
      .map(({ id, staffRole }) => ({ id, role: staffRole! }));

    const report = await reapplyModeration({
      entries: {
        ...empty,
        staff: [
          ...others,
          { id: kept.id, role: StaffRole.ADMIN },
          { id: changed.id, role: StaffRole.ADMIN },
          { id: "unknown-user", role: StaffRole.ADMIN },
        ],
      },
      uploadDir,
      now: NOW,
    });
    // The operator's 2FA went too; switched on again for the next tests.
    await prisma.user.update({ where: { id: operator.id }, data: { twoFactorEnabled: true } });
    expect(report.staffRoles).toBe(2);
    expect(report.twoFactorResets).toBeGreaterThanOrEqual(1);
    expect([await role(kept.id), await role(removed.id), await role(changed.id)]).toEqual([
      StaffRole.ADMIN,
      null,
      StaffRole.ADMIN,
    ]);
    expect(await prisma.twoFactor.count({ where: { userId: removed.id } })).toBe(0);
    // The secret might be one reset after the backup: set up again at the next login.
    expect(await prisma.user.findUniqueOrThrow({ where: { id: kept.id } })).toMatchObject({
      staffRole: StaffRole.ADMIN,
      twoFactorEnabled: false,
    });
    expect(await prisma.twoFactor.count({ where: { userId: kept.id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: kept.id } })).toBe(0);
  });
});

describe("races (§4)", () => {
  it("decideVerification and a removal of the reviewer's role run without deadlock", async () => {
    for (let round = 0; round < 5; round++) {
      const reviewer = await candidate({ staffRole: StaffRole.REVIEWER });
      const student = await createUser();
      const request = await prisma.verificationRequest.create({
        data: {
          userId: student.id,
          pendingUserId: student.id,
          mimeType: "application/pdf",
          sizeBytes: 1,
          status: VerifStatus.PENDING,
          createdAt: NOW,
        },
      });
      const results = await Promise.allSettled([
        decideVerification({
          requestId: request.id,
          adminId: reviewer.id,
          decision: "REJECTED",
          rejectReason: "Unleserlich",
          uploadDir,
          now: NOW,
        }),
        setStaffRole({ operatorId: operator.id, userId: reviewer.id, role: null }),
      ]);
      for (const result of results) {
        if (result.status === "rejected") expect(isDomainError(result.reason)).toBe(true);
      }
      const decided = await prisma.verificationRequest.findUniqueOrThrow({
        where: { id: request.id },
      });
      // Either the decision came first, or the reviewer had no role any more.
      expect([VerifStatus.REJECTED, VerifStatus.PENDING]).toContain(decided.status);
      expect(await role(reviewer.id)).toBeNull();
    }
  });
});
