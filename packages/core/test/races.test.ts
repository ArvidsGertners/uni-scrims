// Concurrency between bans, account deletion and the actions of the same user (ARCHITECTURE §4 lock
// order, §7). Every rejection must be a DomainError: deadlocks surface as Prisma errors.
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AppStatus, NotifType, ScrimStatus, VerifStatus, prisma } from "@uni-scrims/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  autoRejectStaleVerifications,
  banTeam,
  banUser,
  confirmApplication,
  createTeam,
  decideVerification,
  deleteAccount,
  deleteRequest,
  deletedUserEmail,
  expireRequests,
  findUserByDiscordId,
  isDomainError,
  joinTeam,
  leaveTeam,
  applyToRequest,
  regenerateInvite,
  submitVerification,
  updateTeam,
} from "../src/index.ts";
import {
  NOW,
  REQUEST_STARTS_AT,
  createOpenRequest,
  createReadyTeam,
  createTeamWithMembers,
  createUser,
  uid,
  useAdmin,
} from "./helpers.ts";

const ROUNDS = 10;
const DAY = 24 * 60 * 60 * 1000;
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

const admin = useAdmin();
let uploadDir: string;
let universityId: string;

beforeAll(async () => {
  const university = await prisma.university.create({
    data: { name: "Race-Uni", city: "Teststadt", slug: `race-${uid()}` },
  });
  universityId = university.id;
});

beforeEach(async () => {
  uploadDir = await mkdtemp(path.join(tmpdir(), "uni-scrims-races-"));
  return () => rm(uploadDir, { recursive: true, force: true });
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** All rejections are domain errors (no deadlock, no unexpected database error). */
function expectOnlyDomainErrors(results: PromiseSettledResult<unknown>[]) {
  for (const result of results) {
    if (result.status === "rejected") expect(isDomainError(result.reason)).toBe(true);
  }
}

function team(name: string) {
  return { name: `${name} ${uid().slice(0, 12)}`, tag: "RACE", rank: "GOLD" as const };
}

const upload = (userId: string) =>
  submitVerification({ userId, universityId, consent: true, file: PDF, uploadDir, now: NOW });
const remove = (userId: string) => deleteAccount({ userId, uploadDir, now: NOW });
const ban = (userId: string) => banUser({ adminId: admin.id, userId, uploadDir, now: NOW });

describe("applyToRequest while the applicant team is retired", () => {
  it("leaves no pending application of a team banned meanwhile", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const host = await createReadyTeam();
      const guest = await createReadyTeam();
      const request = await createOpenRequest(host.captain.id);
      const results = await Promise.allSettled([
        applyToRequest({ userId: guest.captain.id, requestId: request.id, now: NOW }),
        round % 2 === 0
          ? banTeam({ adminId: admin.id, teamId: guest.team.id, now: NOW })
          : ban(guest.captain.id),
      ]);
      expectOnlyDomainErrors(results);
      expect(results[1].status).toBe("fulfilled");
      expect(
        await prisma.application.count({
          where: { teamId: guest.team.id, status: AppStatus.PENDING },
        }),
      ).toBe(0);
    }
  });

  it("does not deadlock when both teams apply to each other while being retired", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const a = await createReadyTeam();
      const b = await createReadyTeam();
      const requestA = await createOpenRequest(a.captain.id);
      const requestB = await createOpenRequest(b.captain.id);
      const results = await Promise.allSettled([
        applyToRequest({ userId: a.captain.id, requestId: requestB.id, now: NOW }),
        applyToRequest({ userId: b.captain.id, requestId: requestA.id, now: NOW }),
        banTeam({ adminId: admin.id, teamId: b.team.id, now: NOW }),
        createOpenRequest(a.captain.id),
      ]);
      expectOnlyDomainErrors(results);
      expect(
        await prisma.application.count({
          where: { teamId: b.team.id, status: AppStatus.PENDING },
        }),
      ).toBe(0);
      expect(
        await prisma.application.count({
          where: { requestId: requestB.id, status: AppStatus.PENDING },
        }),
      ).toBe(0);
    }
  });
});

describe("two teams retired at the same time", () => {
  it("does not deadlock when they applied to each other's requests", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const a = await createReadyTeam();
      const b = await createReadyTeam();
      const requestA = await createOpenRequest(a.captain.id);
      const requestB = await createOpenRequest(b.captain.id);
      await applyToRequest({ userId: a.captain.id, requestId: requestB.id, now: NOW });
      await applyToRequest({ userId: b.captain.id, requestId: requestA.id, now: NOW });
      const results = await Promise.allSettled([
        banTeam({ adminId: admin.id, teamId: a.team.id, now: NOW }),
        round % 2 === 0
          ? banTeam({ adminId: admin.id, teamId: b.team.id, now: NOW })
          : ban(b.captain.id),
      ]);
      expectOnlyDomainErrors(results);
      expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
      expect(
        await prisma.application.count({
          where: { requestId: { in: [requestA.id, requestB.id] }, status: AppStatus.PENDING },
        }),
      ).toBe(0);
    }
  });
});

describe("deleteAccount and the requests whose notes it clears", () => {
  it("does not deadlock with a deletion or expiry of such a request", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      // The user wrote the note as an earlier captain of X and now captains T alone; T applied to
      // the request. The deletion withdraws that application and clears the note.
      const x = await createReadyTeam();
      const { team: t, captain: user } = await createTeamWithMembers();
      const request = await createOpenRequest(x.captain.id, { note: "Discord: alt#0001" });
      await prisma.scrimRequest.update({
        where: { id: request.id },
        data: { createdById: user.id },
      });
      await prisma.application.create({
        data: { requestId: request.id, teamId: t.id, status: AppStatus.PENDING, createdAt: NOW },
      });
      const results = await Promise.allSettled([
        remove(user.id),
        round % 2 === 0
          ? deleteRequest({ userId: x.captain.id, requestId: request.id, now: NOW })
          : expireRequests(REQUEST_STARTS_AT),
      ]);
      expectOnlyDomainErrors(results);
      expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
      expect(
        await prisma.scrimRequest.findUniqueOrThrow({ where: { id: request.id } }),
      ).toMatchObject({ note: null });
      expect(
        await prisma.application.count({
          where: { requestId: request.id, status: AppStatus.PENDING },
        }),
      ).toBe(0);
    }
  });
});

describe("team changes while the team is dissolved", () => {
  it("never writes the name or an invite code back onto a dissolved team", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { team: target, captain } = await createTeamWithMembers();
      const results = await Promise.allSettled([
        round % 2 === 0
          ? updateTeam({ userId: captain.id, teamId: target.id, ...team("Renamed") })
          : regenerateInvite({ userId: captain.id, teamId: target.id }),
        leaveTeam({ userId: captain.id, now: NOW }),
      ]);
      expectOnlyDomainErrors(results);
      expect(results[1].status).toBe("fulfilled");
      expect(await prisma.team.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({
        dissolvedAt: NOW,
        nameNormalized: null,
        inviteCode: null,
      });
    }
  });
});

describe("confirmApplication while a team is banned", () => {
  it("never books a scrim with a banned team", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const host = await createReadyTeam();
      const guest = await createReadyTeam();
      const request = await createOpenRequest(host.captain.id);
      const { application } = await applyToRequest({
        userId: guest.captain.id,
        requestId: request.id,
        now: NOW,
      });
      const banned = round % 2 === 0 ? guest : host;
      const results = await Promise.allSettled([
        confirmApplication({
          userId: host.captain.id,
          requestId: request.id,
          applicationId: application.id,
          now: NOW,
        }),
        banTeam({ adminId: admin.id, teamId: banned.team.id, now: NOW }),
      ]);
      expectOnlyDomainErrors(results);
      expect(results[1].status).toBe("fulfilled");
      // Booked first and cancelled by the ban, or not booked at all.
      expect(
        await prisma.scrim.count({
          where: { requestId: request.id, status: { not: ScrimStatus.CANCELLED } },
        }),
      ).toBe(0);
    }
  });
});

describe("joinTeam and createTeam while the user is banned or deleted", () => {
  it("rejects a deleted account", async () => {
    const { team: target } = await createTeamWithMembers();
    const user = await createUser();
    await remove(user.id);
    await expect(
      joinTeam({ userId: user.id, inviteCode: target.inviteCode!, now: NOW }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(createTeam({ userId: user.id, ...team("Gone"), now: NOW })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("leaves a user banned while joining in no team", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { team: target } = await createTeamWithMembers();
      const user = await createUser();
      const results = await Promise.allSettled([
        joinTeam({ userId: user.id, inviteCode: target.inviteCode!, now: NOW }),
        ban(user.id),
      ]);
      expectOnlyDomainErrors(results);
      const { bannedAt } = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      if (bannedAt) {
        expect(await prisma.teamMember.findUnique({ where: { userId: user.id } })).toBeNull();
      } else {
        expect(results[1]).toMatchObject({ status: "rejected", reason: { code: "CONFLICT" } });
      }
    }
  });

  it("leaves a user banned while founding a team in no active team", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const user = await createUser();
      const results = await Promise.allSettled([
        createTeam({ userId: user.id, ...team("Ban"), now: NOW }),
        ban(user.id),
      ]);
      expectOnlyDomainErrors(results);
      const { bannedAt } = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      if (bannedAt) {
        // Either no team, or the ban saw the new team and banned it with its captain.
        const membership = await prisma.teamMember.findUnique({
          where: { userId: user.id },
          include: { team: true },
        });
        if (membership) expect(membership.team.bannedAt).toEqual(NOW);
      } else {
        expect(results[1]).toMatchObject({ status: "rejected", reason: { code: "CONFLICT" } });
      }
    }
  });

  it("leaves a user deleted while joining or founding in no team", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { team: target } = await createTeamWithMembers();
      const user = await createUser();
      const results = await Promise.allSettled([
        round % 2 === 0
          ? joinTeam({ userId: user.id, inviteCode: target.inviteCode!, now: NOW })
          : createTeam({ userId: user.id, ...team("Del"), now: NOW }),
        remove(user.id),
      ]);
      expectOnlyDomainErrors(results);
      const { email } = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      if (email === deletedUserEmail(user.id)) {
        expect(await prisma.teamMember.findUnique({ where: { userId: user.id } })).toBeNull();
        expect(await prisma.team.count({ where: { captainId: user.id, dissolvedAt: null } })).toBe(
          0,
        );
      } else {
        expect(results[1]).toMatchObject({ status: "rejected", reason: { code: "CONFLICT" } });
      }
    }
  });
});

describe("banUser and deleteAccount in parallel", () => {
  it("never lets a deletion dodge a ban", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      // A player, a captain with members (the ban bans the team, the deletion only works once the
      // team is banned) and a user without a team, where only the user row orders the two.
      const { captain, members } = await createTeamWithMembers({ extraMembers: 2 });
      const user = [members[0]!, captain, await createUser()][round % 3]!;
      const results = await Promise.allSettled([ban(user.id), remove(user.id)]);
      expectOnlyDomainErrors(results);
      const holder = await findUserByDiscordId(user.discordId);
      if (results[0].status === "fulfilled") {
        // Banned: the Discord ID stays banned, on the user or on its placeholder after the deletion.
        expect(holder).toMatchObject({ bannedAt: NOW });
      } else {
        // The deletion came first and removed the Discord link, so the ban was refused.
        expect(results[0]).toMatchObject({ reason: { code: "CONFLICT" } });
        expect(holder).toBeNull();
      }
      if (results[1].status === "fulfilled") {
        expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
          email: deletedUserEmail(user.id),
        });
        expect(await prisma.account.count({ where: { userId: user.id } })).toBe(0);
      }
    }
  });
});

describe("verifications while the account is deleted or banned", () => {
  it("rejects an upload of a deleted account and keeps no file", async () => {
    const user = await createUser();
    await remove(user.id);
    await expect(upload(user.id)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(await readdir(uploadDir)).toEqual([]);
  });

  it("leaves no request and no file when the account is deleted while uploading", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const user = await createUser();
      const results = await Promise.allSettled([upload(user.id), remove(user.id)]);
      expectOnlyDomainErrors(results);
      expect(results[1].status).toBe("fulfilled");
      expect(await prisma.verificationRequest.count({ where: { userId: user.id } })).toBe(0);
    }
    expect(await readdir(uploadDir)).toEqual([]);
  });

  it("leaves no pending request and no file when banned while uploading", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const user = await createUser();
      const results = await Promise.allSettled([upload(user.id), ban(user.id)]);
      expectOnlyDomainErrors(results);
      expect(results[1].status).toBe("fulfilled");
      expect(
        await prisma.verificationRequest.count({
          where: { userId: user.id, status: VerifStatus.PENDING },
        }),
      ).toBe(0);
    }
    expect(await readdir(uploadDir)).toEqual([]);
  });

  it("does not deadlock when an account is deleted during a decision", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const user = await createUser();
      const request = await upload(user.id);
      const results = await Promise.allSettled([
        decideVerification({
          requestId: request.id,
          adminId: admin.id,
          decision: round % 2 === 0 ? "APPROVED" : "REJECTED",
          rejectReason: round % 2 === 0 ? null : "unlesbar",
          uploadDir,
          now: NOW,
        }),
        remove(user.id),
      ]);
      expectOnlyDomainErrors(results);
      expect(results[1].status).toBe("fulfilled");
      expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
        verifiedAt: null,
      });
      expect(await prisma.verificationRequest.count({ where: { userId: user.id } })).toBe(0);
      expect(
        await prisma.notification.count({
          where: { targetUserId: user.id, type: NotifType.VERIFICATION_RESULT },
        }),
      ).toBe(0);
      expect(existsSync(path.join(uploadDir, request.filePath!))).toBe(false);
    }
  });

  it("does not deadlock when the janitor rejects during a deletion", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const user = await createUser();
      await upload(user.id);
      const results = await Promise.allSettled([
        autoRejectStaleVerifications(new Date(NOW.getTime() + 15 * DAY), uploadDir),
        remove(user.id),
      ]);
      expectOnlyDomainErrors(results);
      expect(results[1].status).toBe("fulfilled");
      expect(await prisma.verificationRequest.count({ where: { userId: user.id } })).toBe(0);
    }
  });

  it("does not deadlock when a decision and a ban meet", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const user = await createUser();
      const request = await upload(user.id);
      const results = await Promise.allSettled([
        decideVerification({
          requestId: request.id,
          adminId: admin.id,
          decision: "APPROVED",
          uploadDir,
          now: NOW,
        }),
        ban(user.id),
      ]);
      expectOnlyDomainErrors(results);
      expect(results[1].status).toBe("fulfilled");
      expect(
        await prisma.verificationRequest.count({
          where: { userId: user.id, status: VerifStatus.PENDING },
        }),
      ).toBe(0);
    }
  });
});

describe("leaveTeam while being banned", () => {
  it("does not deadlock", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { members } = await createTeamWithMembers({ extraMembers: 1 });
      const player = members[0]!;
      const results = await Promise.allSettled([
        leaveTeam({ userId: player.id, now: NOW }),
        ban(player.id),
      ]);
      expectOnlyDomainErrors(results);
      expect(await prisma.teamMember.findUnique({ where: { userId: player.id } })).toBeNull();
    }
  });
});
