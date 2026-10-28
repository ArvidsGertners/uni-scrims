// Concurrency between bans, account deletion and the actions of the same user (ARCHITECTURE §4 lock
// order, §7). Every rejection must be a DomainError: deadlocks surface as Prisma errors.
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  AppStatus,
  FeedbackOutcome,
  LogoBackground,
  NotifChannel,
  NotifType,
  ScrimStatus,
  VerifStatus,
  prisma,
} from "@uni-scrims/db";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptDirectRequest,
  deleteOwnMessage,
  reportMessage,
  sendMessage,
  createReadyWindow,
  endReadyWindow,
  requestReadyWindow,
  autoRejectStaleVerifications,
  banTeam,
  declineDirectRequest,
  createRequest,
  endRequestSeries,
  postSeriesRequests,
  transferCaptain,
  banUser,
  confirmApplication,
  createTeam,
  decideVerification,
  deleteAccount,
  deleteRequest,
  deletedUserEmail,
  deliverNotification,
  expireRequests,
  findUserByDiscordId,
  isDomainError,
  joinTeam,
  leaveTeam,
  applyToRequest,
  regenerateInvite,
  submitFeedback,
  submitVerification,
  updateTeam,
  updateTeamLinks,
  setTeamLogo,
} from "../src/index.ts";
import { queueNotifications } from "../src/notifications.ts";
import {
  NOW,
  REQUEST_INPUT,
  REQUEST_STARTS_AT,
  bookScrim,
  createOpenRequest,
  createFullyVerifiedTeam,
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
  return { name: `${name} ${uid().slice(0, 12)}`, tag: "RACE" };
}

const upload = (userId: string) =>
  submitVerification({ userId, universityId, consent: true, file: PDF, uploadDir, now: NOW });
const remove = (userId: string) => deleteAccount({ userId, uploadDir, now: NOW });
const ban = (userId: string) => banUser({ adminId: admin.id, userId, uploadDir, now: NOW });

describe("applyToRequest while the applicant team is retired", () => {
  it("leaves no pending application of a team banned meanwhile", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const host = await createFullyVerifiedTeam();
      const guest = await createFullyVerifiedTeam();
      const request = await createOpenRequest(host.captain.id);
      const results = await Promise.allSettled([
        applyToRequest({
          userId: guest.captain.id,
          teamId: guest.team.id,
          requestId: request.id,
          now: NOW,
        }),
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
      const a = await createFullyVerifiedTeam();
      const b = await createFullyVerifiedTeam();
      const requestA = await createOpenRequest(a.captain.id);
      const requestB = await createOpenRequest(b.captain.id);
      const results = await Promise.allSettled([
        applyToRequest({
          userId: a.captain.id,
          teamId: a.team.id,
          requestId: requestB.id,
          now: NOW,
        }),
        applyToRequest({
          userId: b.captain.id,
          teamId: b.team.id,
          requestId: requestA.id,
          now: NOW,
        }),
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
      const a = await createFullyVerifiedTeam();
      const b = await createFullyVerifiedTeam();
      const requestA = await createOpenRequest(a.captain.id);
      const requestB = await createOpenRequest(b.captain.id);
      await applyToRequest({
        userId: a.captain.id,
        teamId: a.team.id,
        requestId: requestB.id,
        now: NOW,
      });
      await applyToRequest({
        userId: b.captain.id,
        teamId: b.team.id,
        requestId: requestA.id,
        now: NOW,
      });
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
      const x = await createFullyVerifiedTeam();
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
        leaveTeam({ userId: captain.id, teamId: target.id, now: NOW }),
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

describe("team logo while the team is dissolved", () => {
  it("never leaves a logo on a dissolved team", async () => {
    const file = new Uint8Array(
      await sharp({ create: { width: 300, height: 200, channels: 4, background: "#e62828" } })
        .png()
        .toBuffer(),
    );
    for (let round = 0; round < ROUNDS; round++) {
      const { team: target, captain } = await createTeamWithMembers();
      const results = await Promise.allSettled([
        setTeamLogo({
          userId: captain.id,
          teamId: target.id,
          background: LogoBackground.DARK,
          file,
          now: NOW,
        }),
        leaveTeam({ userId: captain.id, teamId: target.id, now: NOW }),
      ]);
      expectOnlyDomainErrors(results);
      expect(results[1].status).toBe("fulfilled");
      expect(await prisma.teamLogo.count({ where: { teamId: target.id } })).toBe(0);
      expect(
        (await prisma.team.findUniqueOrThrow({ where: { id: target.id } })).logoUpdatedAt,
      ).toBeNull();
    }
  });
});

describe("team links while the team is dissolved", () => {
  it("never leaves links on a dissolved team", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { team: target, captain } = await createTeamWithMembers();
      const results = await Promise.allSettled([
        updateTeamLinks({
          userId: captain.id,
          teamId: target.id,
          links: { website: "eure-seite.de" },
          now: NOW,
        }),
        leaveTeam({ userId: captain.id, teamId: target.id, now: NOW }),
      ]);
      expectOnlyDomainErrors(results);
      expect(results[1].status).toBe("fulfilled");
      expect(await prisma.team.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({
        websiteUrl: null,
        linksUpdatedAt: null,
      });
    }
  });
});

describe("confirmApplication while a team is banned", () => {
  it("never books a scrim with a banned team", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const host = await createFullyVerifiedTeam();
      const guest = await createFullyVerifiedTeam();
      const request = await createOpenRequest(host.captain.id);
      const { application } = await applyToRequest({
        userId: guest.captain.id,
        teamId: guest.team.id,
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
        expect(await prisma.teamMember.findFirst({ where: { userId: user.id } })).toBeNull();
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
        const membership = await prisma.teamMember.findFirst({
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
        expect(await prisma.teamMember.findFirst({ where: { userId: user.id } })).toBeNull();
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

  it("does not deadlock when the janitor rejects during a ban", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const user = await createUser();
      await upload(user.id);
      const results = await Promise.allSettled([
        autoRejectStaleVerifications(new Date(NOW.getTime() + 15 * DAY), uploadDir),
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
    expect(await readdir(uploadDir)).toEqual([]);
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
      const { team: playerTeam, members } = await createTeamWithMembers({ extraMembers: 1 });
      const player = members[0]!;
      const results = await Promise.allSettled([
        leaveTeam({ userId: player.id, teamId: playerTeam.id, now: NOW }),
        ban(player.id),
      ]);
      expectOnlyDomainErrors(results);
      expect(await prisma.teamMember.findFirst({ where: { userId: player.id } })).toBeNull();
    }
  });
});

describe("submitFeedback while the captain deletes the account", () => {
  it("does not deadlock and stores no answer after the deletion", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { guest, scrim } = await bookScrim();
      await prisma.teamMember.deleteMany({
        where: { teamId: guest.team.id, userId: { not: guest.captain.id } },
      });
      const afterStart = new Date(scrim.startsAt.getTime() + 60 * 60 * 1000);
      const results = await Promise.allSettled([
        submitFeedback({
          userId: guest.captain.id,
          teamId: guest.team.id,
          scrimId: scrim.id,
          outcome: FeedbackOutcome.PLAYED,
          rating: 5,
          now: afterStart,
        }),
        deleteAccount({ userId: guest.captain.id, uploadDir, now: afterStart }),
      ]);
      expectOnlyDomainErrors(results);
      expect(results[1].status).toBe("fulfilled");
      if (results[0].status === "rejected") {
        expect(
          await prisma.scrimFeedback.count({ where: { submittedById: guest.captain.id } }),
        ).toBe(0);
      }
    }
  });
});

describe("personal notifications fanned out while accounts and teams change (§5.17)", () => {
  const sendNothing = async () => ({ ok: true }) as const;
  const env = { NODE_ENV: "production" };

  it("leaves no copy for an account deleted during the fan-out", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const user = await createUser();
      await queueNotifications(prisma, NOW, [
        {
          type: NotifType.VERIFICATION_RESULT,
          channel: NotifChannel.PERSONAL,
          entityId: uid(),
          targetUserId: user.id,
          payload: { approved: true, rejectReason: null },
        },
      ]);
      const parent = await prisma.notification.findFirstOrThrow({
        where: { targetUserId: user.id, channel: NotifChannel.PERSONAL },
      });
      const results = await Promise.allSettled([
        deliverNotification(parent.id, NOW, sendNothing, env),
        remove(user.id),
      ]);
      expectOnlyDomainErrors(results);
      expect(results[1].status).toBe("fulfilled");
      expect(await prisma.notification.count({ where: { targetUserId: user.id } })).toBe(0);
    }
  });

  it("sends nothing to a member who leaves during the fan-out", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { host, scrim } = await bookScrim();
      const member = host.members[0]!;
      await prisma.notificationPreference.create({
        data: { userId: member.id, type: NotifType.SCRIM_BOOKED, discord: true },
      });
      const parent = await prisma.notification.findFirstOrThrow({
        where: {
          scrimId: scrim.id,
          type: NotifType.SCRIM_BOOKED,
          targetTeamId: host.team.id,
          channel: NotifChannel.PERSONAL,
        },
      });
      const results = await Promise.allSettled([
        deliverNotification(parent.id, NOW, sendNothing, env),
        leaveTeam({ userId: member.id, teamId: host.team.id, now: NOW }),
      ]);
      expectOnlyDomainErrors(results);
      const sentTo: string[] = [];
      const children = await prisma.notification.findMany({
        where: { dedupeKey: { contains: `:${parent.id}:` } },
      });
      for (const child of children) {
        await deliverNotification(
          child.id,
          NOW,
          async (message) => {
            if ("userId" in message.recipient) sentTo.push(message.recipient.userId);
            return { ok: true };
          },
          env,
        );
      }
      expect(sentTo).toEqual([host.captain.id]);
    }
  });
});

// Weekly series (§5.27): the sweeper posts under the team lock and the creator's user row. It logs a
// failing series instead of throwing, so a deadlock shows up as a logged error.
describe("postSeriesRequests while the series or its team changes", () => {
  // REQUEST_STARTS_AT starts the series; its next date is due then.
  const NEXT = new Date("2026-10-29T19:00:00Z");
  const seriesIds: string[] = [];

  afterAll(async () => {
    await prisma.requestSeries.updateMany({
      where: { id: { in: seriesIds }, endedAt: null },
      data: { endedAt: NOW },
    });
  });

  async function series(captainId: string, teamId: string, note: string | null = null) {
    const request = await createRequest({
      ...REQUEST_INPUT,
      note,
      repeatUntil: "2026-11-19",
      userId: captainId,
      teamId,
      now: NOW,
    });
    seriesIds.push(request.seriesId!);
    return request.seriesId!;
  }

  async function postedNext(seriesId: string) {
    return prisma.scrimRequest.findMany({ where: { seriesId, startsAt: NEXT } });
  }

  /** Runs the sweeper step next to `other` and fails on any logged error of the step. */
  async function raceSweeper(other: () => Promise<unknown>) {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const results = await Promise.allSettled([postSeriesRequests(REQUEST_STARTS_AT), other()]);
      expectOnlyDomainErrors(results);
      expect(logged).not.toHaveBeenCalled();
      return results;
    } finally {
      logged.mockRestore();
    }
  }

  it("leaves no note of a creator deleted meanwhile, also after leaving the team", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { team: t, captain: user, members } = await createTeamWithMembers({ extraMembers: 1 });
      const seriesId = await series(user.id, t.id, "Discord: alt#0001");
      await transferCaptain({ userId: user.id, teamId: t.id, newCaptainId: members[0]!.id });
      await leaveTeam({ userId: user.id, teamId: t.id, now: NOW });
      await raceSweeper(() => remove(user.id));
      expect(await prisma.scrimRequest.count({ where: { seriesId, note: { not: null } } })).toBe(0);
      expect(
        await prisma.requestSeries.findUniqueOrThrow({ where: { id: seriesId } }),
      ).toMatchObject({ note: null });
    }
  });

  it("posts at most once while the captain ends the series", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { team: t, captain } = await createFullyVerifiedTeam();
      const seriesId = await series(captain.id, t.id);
      await raceSweeper(() =>
        endRequestSeries({ userId: captain.id, seriesId, now: REQUEST_STARTS_AT }),
      );
      expect((await postedNext(seriesId)).length).toBeLessThanOrEqual(1);
      expect(
        await prisma.requestSeries.findUniqueOrThrow({ where: { id: seriesId } }),
      ).not.toMatchObject({ endedAt: null });
    }
  });

  it("leaves neither an open request nor a running series of a team banned meanwhile", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { team: t, captain } = await createFullyVerifiedTeam();
      const seriesId = await series(captain.id, t.id);
      await raceSweeper(() => banTeam({ adminId: admin.id, teamId: t.id, now: REQUEST_STARTS_AT }));
      expect(
        await prisma.scrimRequest.count({
          where: { teamId: t.id, status: "OPEN", startsAt: { gt: REQUEST_STARTS_AT } },
        }),
      ).toBe(0);
      expect(
        await prisma.requestSeries.findUniqueOrThrow({ where: { id: seriesId } }),
      ).not.toMatchObject({ endedAt: null });
    }
  });

  it("posts each date once when two runs meet", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { team: t, captain } = await createFullyVerifiedTeam();
      const seriesId = await series(captain.id, t.id);
      await raceSweeper(() => postSeriesRequests(REQUEST_STARTS_AT));
      expect(await postedNext(seriesId)).toHaveLength(1);
    }
  });

  it("never exceeds the limit of open requests with a request by hand", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { team: t, captain } = await createFullyVerifiedTeam();
      await series(captain.id, t.id);
      // Four open requests when the next date is due, one place left.
      for (let day = 1; day <= 4; day++) {
        await createRequest({
          ...REQUEST_INPUT,
          date: `2026-12-0${day}`,
          userId: captain.id,
          teamId: t.id,
          now: REQUEST_STARTS_AT,
        });
      }
      await raceSweeper(() =>
        createRequest({
          ...REQUEST_INPUT,
          date: "2026-12-05",
          userId: captain.id,
          teamId: t.id,
          now: REQUEST_STARTS_AT,
        }),
      );
      expect(
        await prisma.scrimRequest.count({
          where: { teamId: t.id, status: "OPEN", startsAt: { gt: REQUEST_STARTS_AT } },
        }),
      ).toBe(5);
    }
  });
});

describe("direct requests while the request or its teams change (§5.28)", () => {
  const NEXT = new Date("2026-10-29T19:00:00Z");
  const seriesIds: string[] = [];
  type Team = Awaited<ReturnType<typeof createFullyVerifiedTeam>>;

  afterAll(async () => {
    await prisma.requestSeries.updateMany({
      where: { id: { in: seriesIds }, endedAt: null },
      data: { endedAt: NOW },
    });
  });

  function direct(from: Team, to: Team, repeatUntil: string | null = null) {
    return createRequest({
      ...REQUEST_INPUT,
      repeatUntil,
      userId: from.captain.id,
      teamId: from.team.id,
      targetTeamId: to.team.id,
      now: NOW,
    });
  }

  const accept = (to: Team, requestId: string) =>
    acceptDirectRequest({ userId: to.captain.id, requestId, now: NOW });

  it("books at most once against a withdrawal, a decline or a second acceptance", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const a = await createFullyVerifiedTeam();
      const b = await createFullyVerifiedTeam();
      const request = await direct(a, b);
      const others = [
        () => deleteRequest({ userId: a.captain.id, requestId: request.id, now: NOW }),
        () => declineDirectRequest({ userId: b.captain.id, requestId: request.id, now: NOW }),
        () => accept(b, request.id),
      ];
      const kind = round % others.length;
      const results = await Promise.allSettled([accept(b, request.id), others[kind]!()]);
      expectOnlyDomainErrors(results);
      // Exactly one of the two wins.
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const scrims = await prisma.scrim.count({ where: { requestId: request.id } });
      const { status } = await prisma.scrimRequest.findUniqueOrThrow({
        where: { id: request.id },
      });
      expect(scrims).toBe(status === "BOOKED" ? 1 : 0);
    }
  });

  it("leaves no scheduled scrim with a team banned meanwhile", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const a = await createFullyVerifiedTeam();
      const b = await createFullyVerifiedTeam();
      const request = await direct(a, b);
      const banned = round % 2 === 0 ? a : b;
      const results = await Promise.allSettled([
        accept(b, request.id),
        banTeam({ adminId: admin.id, teamId: banned.team.id, now: NOW }),
      ]);
      expectOnlyDomainErrors(results);
      expect(results[1].status).toBe("fulfilled");
      expect(
        await prisma.scrim.count({ where: { requestId: request.id, status: "SCHEDULED" } }),
      ).toBe(0);
      expect(await prisma.scrimRequest.count({ where: { id: request.id, status: "OPEN" } })).toBe(
        0,
      );
    }
  });

  it("leaves no open direct request to a team banned meanwhile", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const a = await createFullyVerifiedTeam();
      const b = await createFullyVerifiedTeam();
      const results = await Promise.allSettled([
        direct(a, b),
        banTeam({ adminId: admin.id, teamId: b.team.id, now: NOW }),
      ]);
      expectOnlyDomainErrors(results);
      expect(results[1].status).toBe("fulfilled");
      expect(
        await prisma.scrimRequest.count({ where: { targetTeamId: b.team.id, status: "OPEN" } }),
      ).toBe(0);
    }
  });

  it("books each partnership date once against an end by the partner and a second run", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const a = await createFullyVerifiedTeam();
      const b = await createFullyVerifiedTeam();
      const request = await direct(a, b, "2026-11-19");
      await accept(b, request.id);
      const { seriesId } = await prisma.scrimRequest.findUniqueOrThrow({
        where: { id: request.id },
      });
      seriesIds.push(seriesId!);
      const ending = round % 2 === 0;
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const results = await Promise.allSettled([
          postSeriesRequests(REQUEST_STARTS_AT),
          ending
            ? endRequestSeries({
                userId: b.captain.id,
                seriesId: seriesId!,
                now: REQUEST_STARTS_AT,
              })
            : postSeriesRequests(REQUEST_STARTS_AT),
        ]);
        expectOnlyDomainErrors(results);
        expect(logged).not.toHaveBeenCalled();
      } finally {
        logged.mockRestore();
      }
      const booked = await prisma.scrim.count({ where: { request: { seriesId }, startsAt: NEXT } });
      if (ending) expect(booked).toBeLessThanOrEqual(1);
      else expect(booked).toBe(1);
    }
  });
});

describe("ready windows while their requests or teams change (§5.29)", () => {
  type Team = Awaited<ReturnType<typeof createFullyVerifiedTeam>>;
  // Wednesday 19:00 to 22:00 Berlin, NOW being 14:00.
  const WINDOW = {
    from: "19:00",
    to: "22:00",
    format: REQUEST_INPUT.format,
    rankMin: REQUEST_INPUT.rankMin,
    rankMax: REQUEST_INPUT.rankMax,
    maps: [],
  };
  const TWENTY = new Date("2026-10-21T18:00:00Z");

  const announce = (team: Team) =>
    createReadyWindow({
      ...WINDOW,
      userId: team.captain.id,
      teamId: team.team.id,
      evening: "2026-10-21",
      now: NOW,
    });
  const requestFor = (from: Team, windowId: string) =>
    requestReadyWindow({
      userId: from.captain.id,
      teamId: from.team.id,
      windowId,
      startsAt: TWENTY,
      now: NOW,
    });
  const accept = (to: Team, requestId: string) =>
    acceptDirectRequest({ userId: to.captain.id, requestId, now: NOW });

  it("books once when two requests of one window are accepted", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const a = await createFullyVerifiedTeam();
      const window = await announce(a);
      const fromB = await requestFor(await createFullyVerifiedTeam(), window.id);
      const fromC = await requestFor(await createFullyVerifiedTeam(), window.id);
      const results = await Promise.allSettled([accept(a, fromB.id), accept(a, fromC.id)]);
      expectOnlyDomainErrors(results);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(await prisma.scrim.count({ where: { requestId: { in: [fromB.id, fromC.id] } } })).toBe(
        1,
      );
      expect(
        await prisma.scrimRequest.count({ where: { readyWindowId: window.id, status: "OPEN" } }),
      ).toBe(0);
    }
  });

  it("leaves no open request in a window ended or booked meanwhile", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const a = await createFullyVerifiedTeam();
      const window = await announce(a);
      const first = await requestFor(await createFullyVerifiedTeam(), window.id);
      const late = await createFullyVerifiedTeam();
      const results = await Promise.allSettled([
        requestFor(late, window.id),
        round % 2 === 0
          ? endReadyWindow({ userId: a.captain.id, windowId: window.id, now: NOW })
          : accept(a, first.id),
      ]);
      expectOnlyDomainErrors(results);
      expect(results[1].status).toBe("fulfilled");
      expect(
        await prisma.scrimRequest.count({ where: { readyWindowId: window.id, status: "OPEN" } }),
      ).toBe(0);
    }
  });

  it("keeps one running window when a team announces twice", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const a = await createFullyVerifiedTeam();
      const results = await Promise.allSettled([announce(a), announce(a)]);
      expectOnlyDomainErrors(results);
      expect(await prisma.readyWindow.count({ where: { teamId: a.team.id } })).toBe(1);
    }
  });

  it("leaves no running window of a team banned meanwhile", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const a = await createFullyVerifiedTeam();
      const results = await Promise.allSettled([
        announce(a),
        banTeam({ adminId: admin.id, teamId: a.team.id, now: NOW }),
      ]);
      expectOnlyDomainErrors(results);
      expect(results[1].status).toBe("fulfilled");
      expect(await prisma.readyWindow.count({ where: { teamId: a.team.id, endedAt: null } })).toBe(
        0,
      );
    }
  });
});

describe("messages while the thread or its author change (§5.30)", () => {
  async function thread() {
    const host = await createTeamWithMembers({ extraMembers: 1, verifiedMembers: false });
    const guest = await createTeamWithMembers({ extraMembers: 1, verifiedMembers: false });
    const request = await createOpenRequest(host.captain.id);
    await applyToRequest({
      userId: guest.captain.id,
      teamId: guest.team.id,
      requestId: request.id,
      now: NOW,
    });
    return { host, guest, key: { requestId: request.id, guestTeamId: guest.team.id } };
  }

  it("makes one thread and one notification of two first messages", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { host, guest, key } = await thread();
      const results = await Promise.allSettled(
        [guest.captain, guest.members[0]!].map((user) =>
          sendMessage({ userId: user.id, teamId: guest.team.id, ...key, body: "hi", now: NOW }),
        ),
      );
      expectOnlyDomainErrors(results);
      expect(results.every((result) => result.status === "fulfilled")).toBe(true);
      expect(await prisma.conversation.count({ where: key })).toBe(1);
      expect(
        await prisma.notification.count({
          where: { type: NotifType.MESSAGE_RECEIVED, targetTeamId: host.team.id },
        }),
      ).toBe(1);
    }
  });

  it("leaves no message of an account deleted meanwhile", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { guest, key } = await thread();
      const member = guest.members[0]!;
      const results = await Promise.allSettled([
        sendMessage({ userId: member.id, teamId: guest.team.id, ...key, body: "hi", now: NOW }),
        remove(member.id),
      ]);
      expectOnlyDomainErrors(results);
      expect(results[1].status).toBe("fulfilled");
      expect(await prisma.message.count({ where: { authorId: member.id } })).toBe(0);
    }
  });

  it("does not fail on the foreign key when a report meets the deletion", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const { host, guest, key } = await thread();
      await sendMessage({
        userId: guest.captain.id,
        teamId: guest.team.id,
        ...key,
        body: "hi",
        now: NOW,
      });
      const message = await prisma.message.findFirstOrThrow({
        where: { authorId: guest.captain.id },
      });
      const results = await Promise.allSettled([
        reportMessage({
          userId: host.captain.id,
          teamId: host.team.id,
          messageId: message.id,
          now: NOW,
        }),
        deleteOwnMessage({ userId: guest.captain.id, messageId: message.id, now: NOW }),
      ]);
      expectOnlyDomainErrors(results);
      expect(results[1].status).toBe("fulfilled");
      expect(await prisma.messageReport.count({ where: { messageId: message.id } })).toBe(0);
    }
  });
});
