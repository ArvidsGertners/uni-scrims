import { tmpdir } from "node:os";
import { MemberRole, StaffRole, prisma } from "@uni-scrims/db";
import { afterAll, describe, expect, it } from "vitest";
import {
  banTeam,
  banUser,
  decideVerification,
  deleteRequest,
  findStaffCandidates,
  getAdminOverview,
  getBotStatus,
  getSuccessMetrics,
  getVerificationFile,
  isTeamFullyVerified,
  leaveTeam,
  listDisputes,
  listFailedNotifications,
  listPendingVerifications,
  listStaff,
  removeTeamLinksAsAdmin,
  requireAccountUser,
  requireActingCaptain,
  requireActiveAccountUser,
  requireAdmin,
  requireCaptain,
  requireOperator,
  requireReviewer,
  requireStaffMember,
  requireTeamMember,
  requireUser,
  requireVerified,
  decideTeamLimitRequest,
  listTeamLimitRequests,
  resetStaffTwoFactor,
  resolveDispute,
  searchModerationTargets,
  setStaffRole,
  staffArea,
  updateTeam,
} from "../src/index.ts";
import {
  NOW,
  createOpenRequest,
  createFullyVerifiedTeam,
  createTeamWithMembers,
  createUser,
} from "./helpers.ts";

const NOT_IN_TEAM = { code: "FORBIDDEN", message: "Du bist nicht in diesem Team." };

/** Dissolved the real way: the captain leaves as the last member, which deletes the membership. */
async function dissolvedTeam() {
  const dissolved = await createTeamWithMembers();
  await leaveTeam({ userId: dissolved.captain.id, teamId: dissolved.team.id, now: NOW });
  return dissolved;
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("requireUser / requireVerified", () => {
  it("rejects missing and unknown users", async () => {
    await expect(requireUser(null)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(requireUser("missing")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects banned users", async () => {
    const user = await createUser({ banned: true });
    await expect(requireUser(user.id)).rejects.toMatchObject({ code: "BANNED" });
  });

  it("requires verification for requireVerified", async () => {
    const unverified = await createUser();
    const verified = await createUser({ verified: true });
    await expect(requireUser(unverified.id)).resolves.toMatchObject({ id: unverified.id });
    await expect(requireVerified(unverified.id)).rejects.toMatchObject({ code: "NOT_VERIFIED" });
    await expect(requireVerified(verified.id)).resolves.toMatchObject({ id: verified.id });
  });
});

describe("requireCaptain / requireActingCaptain", () => {
  it("allows an unverified captain to manage, but not to act", async () => {
    const { team, captain } = await createTeamWithMembers({ verifiedCaptain: false });
    await expect(requireCaptain(captain.id, team.id)).resolves.toBeTruthy();
    await expect(requireActingCaptain(captain.id, team.id)).rejects.toMatchObject({
      code: "NOT_VERIFIED",
    });
  });

  it("allows a verified captain to act", async () => {
    const { team, captain } = await createTeamWithMembers();
    await expect(requireActingCaptain(captain.id, team.id)).resolves.toBeTruthy();
  });

  it("rejects members who are not the captain", async () => {
    const { team, members } = await createTeamWithMembers({ extraMembers: 1 });
    await expect(requireCaptain(members[0]!.id, team.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects banned and dissolved teams", async () => {
    const banned = await createTeamWithMembers({ banned: true });
    await expect(requireCaptain(banned.captain.id, banned.team.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Das Team ist gesperrt.",
    });
    const dissolved = await dissolvedTeam();
    await expect(requireCaptain(dissolved.captain.id, dissolved.team.id)).rejects.toMatchObject(
      NOT_IN_TEAM,
    );
    // A membership row left behind on a dissolved team does not count either.
    const leftover = await createTeamWithMembers();
    await prisma.team.update({ where: { id: leftover.team.id }, data: { dissolvedAt: NOW } });
    await expect(requireCaptain(leftover.captain.id, leftover.team.id)).rejects.toMatchObject(
      NOT_IN_TEAM,
    );
  });

  it("gives non-members one answer for active, banned, dissolved and unknown teams (§4)", async () => {
    const outsider = await createTeamWithMembers();
    const active = await createTeamWithMembers();
    const banned = await createTeamWithMembers({ banned: true });
    const dissolved = await dissolvedTeam();
    for (const teamId of [active.team.id, banned.team.id, dissolved.team.id, "unknown-team"]) {
      await expect(requireCaptain(outsider.captain.id, teamId)).rejects.toMatchObject(NOT_IN_TEAM);
      await expect(requireActingCaptain(outsider.captain.id, teamId)).rejects.toMatchObject(
        NOT_IN_TEAM,
      );
      await expect(
        updateTeam({
          userId: outsider.captain.id,
          teamId,
          name: "Fremd",
          tag: "FR",
        }),
      ).rejects.toMatchObject(NOT_IN_TEAM);
    }
  });

  it("does not reveal a ban through another team's request (§4)", async () => {
    const outsider = await createFullyVerifiedTeam();
    const owner = await createFullyVerifiedTeam();
    const request = await createOpenRequest(owner.captain.id);
    const remove = () =>
      deleteRequest({ userId: outsider.captain.id, requestId: request.id, now: NOW });
    await expect(remove()).rejects.toMatchObject(NOT_IN_TEAM);
    // Banned directly, so the request is still open, as in a race with the ban.
    await prisma.team.update({ where: { id: owner.team.id }, data: { bannedAt: NOW } });
    await expect(remove()).rejects.toMatchObject(NOT_IN_TEAM);
  });
});

describe("requireTeamMember", () => {
  it("accepts members, also of banned teams", async () => {
    const { team, members } = await createTeamWithMembers({ extraMembers: 1, banned: true });
    await expect(requireTeamMember(members[0]!.id, team.id)).resolves.toBeTruthy();
  });

  it("rejects outsiders", async () => {
    const { team } = await createTeamWithMembers();
    const outsider = await createUser();
    await expect(requireTeamMember(outsider.id, team.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("requireUser and incomplete accounts (§5.8)", () => {
  it("names the missing step, after the ban", async () => {
    const legacy = await createUser({ legacy: true });
    await expect(requireUser(legacy.id)).rejects.toMatchObject({
      code: "ACCOUNT_INCOMPLETE",
      step: "COMPLETE_ACCOUNT",
    });
    await expect(requireAccountUser(legacy.id)).resolves.toMatchObject({ id: legacy.id });
    await prisma.user.update({ where: { id: legacy.id }, data: { firstName: "Ana" } });
    await expect(requireUser(legacy.id)).rejects.toMatchObject({ step: "VERIFY_EMAIL" });
    const banned = await createUser({ legacy: true, banned: true });
    await expect(requireUser(banned.id)).rejects.toMatchObject({ code: "BANNED" });
    // Changing the own account works while incomplete, but not when banned.
    await expect(requireActiveAccountUser(legacy.id)).resolves.toMatchObject({ id: legacy.id });
    await expect(requireActiveAccountUser(banned.id)).rejects.toMatchObject({ code: "BANNED" });
  });
});

describe("isTeamFullyVerified (SPEC N-21)", () => {
  it("needs 5 verified members", async () => {
    const full = await createTeamWithMembers({ extraMembers: 4 });
    expect(await isTeamFullyVerified(full.team.id)).toBe(true);

    const unverified = await createTeamWithMembers({ extraMembers: 4, verifiedMembers: false });
    expect(await isTeamFullyVerified(unverified.team.id)).toBe(false);
  });

  it("counts substitutes but never coaches (SPEC N-1)", async () => {
    const { team, members } = await createTeamWithMembers({ extraMembers: 4 });
    const setRole = (role: MemberRole) =>
      prisma.teamMember.updateMany({ where: { userId: members[3]!.id }, data: { role } });
    await setRole(MemberRole.COACH);
    expect(await isTeamFullyVerified(team.id)).toBe(false);
    await setRole(MemberRole.SUBSTITUTE);
    expect(await isTeamFullyVerified(team.id)).toBe(true);
  });
});

describe("staff checks (§5.9)", () => {
  it("lets each role into its areas only", async () => {
    const operator = await createUser({ staffRole: StaffRole.OPERATOR });
    const admin = await createUser({ staffRole: StaffRole.ADMIN });
    const reviewer = await createUser({ staffRole: StaffRole.REVIEWER });
    const player = await createUser();
    const allowed = async (check: (id: string) => Promise<unknown>, id: string) =>
      check(id).then(
        () => true,
        (error: { code: string }) => (error.code === "FORBIDDEN" ? false : error.code),
      );
    const table = [];
    for (const user of [operator, admin, reviewer, player]) {
      table.push([
        await allowed(requireReviewer, user.id),
        await allowed(requireAdmin, user.id),
        await allowed(requireOperator, user.id),
      ]);
    }
    expect(table).toEqual([
      [true, true, true],
      [true, true, false],
      [true, false, false],
      [false, false, false],
    ]);
    expect(staffArea(StaffRole.REVIEWER, "queue")).toBe(true);
    expect(staffArea(StaffRole.REVIEWER, "admin")).toBe(false);
    expect(staffArea(null, "queue")).toBe(false);
  });

  it("checks the role in every staff function of core", async () => {
    const uploadDir = tmpdir();
    // Unknown targets: a function that lets the role in fails later with NOT_FOUND or does nothing.
    const missing = "missing-id";
    const functions: Record<string, (id: string) => Promise<unknown>> = {
      listPendingVerifications: (id) => listPendingVerifications(id, uploadDir),
      getVerificationFile: (id) => getVerificationFile(missing, id, uploadDir),
      decideVerification: (id) =>
        decideVerification({
          requestId: missing,
          adminId: id,
          decision: "REJECTED",
          rejectReason: "Unleserlich",
          uploadDir,
          now: NOW,
        }),
      listDisputes: (id) => listDisputes(id),
      resolveDispute: (id) =>
        resolveDispute({ decision: "UNCLEAR", adminId: id, scrimId: missing, now: NOW }),
      searchModerationTargets: (id) => searchModerationTargets({ adminId: id, query: "niemand" }),
      banTeam: (id) => banTeam({ adminId: id, teamId: missing, now: NOW }),
      removeTeamLinksAsAdmin: (id) =>
        removeTeamLinksAsAdmin({ adminId: id, teamId: missing, linksVersion: 0 }),
      banUser: (id) => banUser({ adminId: id, userId: missing, uploadDir, now: NOW }),
      listFailedNotifications: (id) => listFailedNotifications(id),
      getBotStatus: (id) => getBotStatus(id, NOW),
      getAdminOverview: (id) => getAdminOverview({ staffId: id, now: NOW }),
      getSuccessMetrics: (id) => getSuccessMetrics({ adminId: id, now: NOW }),
      listStaff: (id) => listStaff(id),
      findStaffCandidates: (id) => findStaffCandidates({ operatorId: id, query: "niemand" }),
      setStaffRole: (id) => setStaffRole({ operatorId: id, userId: missing, role: null }),
      resetStaffTwoFactor: (id) => resetStaffTwoFactor({ operatorId: id, userId: missing }),
      listTeamLimitRequests: (id) => listTeamLimitRequests(id),
      decideTeamLimitRequest: (id) =>
        decideTeamLimitRequest({ adminId: id, requestId: missing, decision: "REJECTED", now: NOW }),
    };
    const area: Record<string, "queue" | "admin" | "staff"> = {
      listPendingVerifications: "queue",
      getVerificationFile: "queue",
      decideVerification: "queue",
      getAdminOverview: "queue",
      listStaff: "staff",
      findStaffCandidates: "staff",
      setStaffRole: "staff",
      resetStaffTwoFactor: "staff",
    };
    for (const role of [StaffRole.OPERATOR, StaffRole.ADMIN, StaffRole.REVIEWER, null]) {
      const user = await createUser({ staffRole: role ?? undefined });
      for (const [name, call] of Object.entries(functions)) {
        const letIn = await call(user.id).then(
          () => true,
          (error: { code?: string }) => error.code !== "FORBIDDEN",
        );
        expect(letIn, `${role} ${name}`).toBe(staffArea(role, area[name] ?? "admin"));
      }
    }
  });

  it("asks for the 2FA setup before any area, and needs a complete, unbanned account", async () => {
    const withoutTwoFactor = await createUser({ staffRole: StaffRole.ADMIN, twoFactor: false });
    await expect(requireReviewer(withoutTwoFactor.id)).rejects.toMatchObject({
      code: "TWO_FACTOR_REQUIRED",
    });
    await expect(requireStaffMember(withoutTwoFactor.id)).resolves.toMatchObject({
      staffRole: StaffRole.ADMIN,
    });
    const banned = await createUser({ staffRole: StaffRole.ADMIN, banned: true });
    await expect(requireAdmin(banned.id)).rejects.toMatchObject({ code: "BANNED" });
    const legacy = await createUser({ staffRole: StaffRole.ADMIN, legacy: true });
    await expect(requireAdmin(legacy.id)).rejects.toMatchObject({ code: "ACCOUNT_INCOMPLETE" });
  });
});
