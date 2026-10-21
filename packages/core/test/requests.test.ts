import {
  AppStatus,
  NotifChannel,
  NotifStatus,
  NotifType,
  Rank,
  RequestStatus,
  ScrimStatus,
  prisma,
} from "@uni-scrims/db";
import { describe, expect, it } from "vitest";
import {
  MAX_OPEN_REQUESTS,
  applyToRequest,
  confirmApplication,
  deleteRequest,
  expireRequests,
  withdrawApplication,
} from "../src/index.ts";
import {
  NOW,
  REQUEST_INPUT,
  REQUEST_STARTS_AT,
  SOON,
  SOON_STARTS_AT,
  createOpenRequest,
  createReadyTeam,
  createTeamWithMembers,
} from "./helpers.ts";

const HOUR = 60 * 60 * 1000;

async function apply(captainId: string, requestId: string, message?: string) {
  return applyToRequest({ userId: captainId, requestId, message, now: NOW });
}

describe("createRequest", () => {
  it("creates an open request with the start converted from Berlin time", async () => {
    const { team, captain } = await createReadyTeam();
    const request = await createOpenRequest(captain.id, { maps: ["Ascent", "Bind"], note: " Hi " });
    expect(request).toMatchObject({
      teamId: team.id,
      createdById: captain.id,
      startsAt: REQUEST_STARTS_AT,
      status: RequestStatus.OPEN,
      maps: ["Ascent", "Bind"],
      note: "Hi",
      createdAt: NOW,
    });
  });

  it("rejects an unverified captain", async () => {
    const { captain } = await createReadyTeam({ verifiedCaptain: false });
    await expect(createOpenRequest(captain.id)).rejects.toMatchObject({ code: "NOT_VERIFIED" });
  });

  it("rejects members who are not the captain", async () => {
    const { members } = await createReadyTeam();
    await expect(createOpenRequest(members[0]!.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects teams with fewer than 5 verified members", async () => {
    const { captain } = await createTeamWithMembers({ extraMembers: 3 });
    await expect(createOpenRequest(captain.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires 30 minutes lead time", async () => {
    const { captain } = await createReadyTeam();
    // NOW is 14:00 in Berlin.
    await expect(
      createOpenRequest(captain.id, { date: "2026-10-21", time: "14:15" }),
    ).rejects.toMatchObject({ code: "INVALID" });
    await expect(
      createOpenRequest(captain.id, { date: "2026-10-21", time: "14:30" }),
    ).resolves.toMatchObject({ startsAt: new Date("2026-10-21T12:30:00Z") });
  });

  it.each([
    ["a time outside the window", { time: "09:45" }],
    ["a time off the grid", { time: "20:10" }],
    ["an invalid date", { date: "2026-02-30" }],
    ["rankMin above rankMax", { rankMin: Rank.DIAMOND, rankMax: Rank.GOLD }],
    ["an unknown map", { maps: ["Dust2"] }],
    ["a map twice", { maps: ["Bind", "Bind"] }],
    ["a long note", { note: "x".repeat(301) }],
  ])("rejects %s", async (_label, overrides) => {
    const { captain } = await createReadyTeam();
    await expect(
      createOpenRequest(captain.id, overrides as Partial<typeof REQUEST_INPUT>),
    ).rejects.toMatchObject({ code: "INVALID" });
  });

  it(`allows at most ${MAX_OPEN_REQUESTS} open requests, also in parallel`, async () => {
    const { team, captain } = await createReadyTeam();
    for (let i = 0; i < MAX_OPEN_REQUESTS - 1; i++) await createOpenRequest(captain.id);
    const results = await Promise.allSettled([
      createOpenRequest(captain.id),
      createOpenRequest(captain.id),
      createOpenRequest(captain.id),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.scrimRequest.count({ where: { teamId: team.id } })).toBe(MAX_OPEN_REQUESTS);
  });
});

describe("applyToRequest", () => {
  it("creates a pending application and notifies the creating team", async () => {
    const host = await createReadyTeam();
    const guest = await createReadyTeam();
    const request = await createOpenRequest(host.captain.id);
    const { application, outOfRange } = await apply(guest.captain.id, request.id, " Gerne! ");
    expect(outOfRange).toBe(false);
    expect(application).toMatchObject({
      teamId: guest.team.id,
      status: AppStatus.PENDING,
      message: "Gerne!",
    });
    const notifications = await prisma.notification.findMany({ where: { requestId: request.id } });
    expect(notifications).toEqual([
      expect.objectContaining({
        type: NotifType.APPLICATION_RECEIVED,
        channel: NotifChannel.CAPTAIN_DM,
        targetTeamId: host.team.id,
        scheduledFor: NOW,
        status: NotifStatus.PENDING,
        dedupeKey: `APPLICATION_RECEIVED:${application.id}:${host.team.id}:CAPTAIN_DM`,
      }),
    ]);
  });

  it("creates one notification per application (§6.1)", async () => {
    const host = await createReadyTeam();
    const request = await createOpenRequest(host.captain.id);
    await apply((await createReadyTeam()).captain.id, request.id);
    await apply((await createReadyTeam()).captain.id, request.id);
    expect(
      await prisma.notification.count({
        where: { requestId: request.id, type: NotifType.APPLICATION_RECEIVED },
      }),
    ).toBe(2);
  });

  it("allows applications outside the rank range with a hint", async () => {
    const host = await createReadyTeam();
    const guest = await createReadyTeam({ rank: Rank.IRON });
    const request = await createOpenRequest(host.captain.id);
    await expect(apply(guest.captain.id, request.id)).resolves.toMatchObject({ outOfRange: true });
  });

  it("rejects applications to the own request", async () => {
    const host = await createReadyTeam();
    const request = await createOpenRequest(host.captain.id);
    await expect(apply(host.captain.id, request.id)).rejects.toMatchObject({ code: "INVALID" });
  });

  it("rejects teams that are not ready and unverified captains", async () => {
    const host = await createReadyTeam();
    const request = await createOpenRequest(host.captain.id);
    const small = await createTeamWithMembers({ extraMembers: 3 });
    await expect(apply(small.captain.id, request.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const unverified = await createReadyTeam({ verifiedCaptain: false });
    await expect(apply(unverified.captain.id, request.id)).rejects.toMatchObject({
      code: "NOT_VERIFIED",
    });
  });

  it("allows only one application per team, also after withdrawing", async () => {
    const host = await createReadyTeam();
    const guest = await createReadyTeam();
    const request = await createOpenRequest(host.captain.id);
    const { application } = await apply(guest.captain.id, request.id);
    await expect(apply(guest.captain.id, request.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await withdrawApplication({
      userId: guest.captain.id,
      applicationId: application.id,
      now: NOW,
    });
    await expect(apply(guest.captain.id, request.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects applications to requests that are no longer open", async () => {
    const host = await createReadyTeam();
    const guest = await createReadyTeam();
    const request = await createOpenRequest(host.captain.id);
    await expect(
      applyToRequest({ userId: guest.captain.id, requestId: request.id, now: REQUEST_STARTS_AT }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await deleteRequest({ userId: host.captain.id, requestId: request.id, now: NOW });
    await expect(apply(guest.captain.id, request.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects long messages", async () => {
    const host = await createReadyTeam();
    const guest = await createReadyTeam();
    const request = await createOpenRequest(host.captain.id);
    await expect(apply(guest.captain.id, request.id, "x".repeat(201))).rejects.toMatchObject({
      code: "INVALID",
    });
  });
});

describe("withdrawApplication", () => {
  it("withdraws a pending application only once and only by the own captain", async () => {
    const host = await createReadyTeam();
    const guest = await createReadyTeam();
    const request = await createOpenRequest(host.captain.id);
    const { application } = await apply(guest.captain.id, request.id);
    const withdraw = (userId: string) =>
      withdrawApplication({ userId, applicationId: application.id, now: NOW });
    await expect(withdraw(host.captain.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await withdraw(guest.captain.id);
    expect(await prisma.application.findUnique({ where: { id: application.id } })).toMatchObject({
      status: AppStatus.WITHDRAWN,
      decidedAt: NOW,
    });
    await expect(withdraw(guest.captain.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("deleteRequest", () => {
  it("cancels the request, rejects pending applications and notifies their teams", async () => {
    const host = await createReadyTeam();
    const pending = await createReadyTeam();
    const withdrawn = await createReadyTeam();
    const request = await createOpenRequest(host.captain.id);
    const { application } = await apply(pending.captain.id, request.id);
    const { application: withdrawnApplication } = await apply(withdrawn.captain.id, request.id);
    await withdrawApplication({
      userId: withdrawn.captain.id,
      applicationId: withdrawnApplication.id,
      now: NOW,
    });

    await expect(
      deleteRequest({ userId: pending.captain.id, requestId: request.id, now: NOW }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await deleteRequest({ userId: host.captain.id, requestId: request.id, now: NOW });

    expect(await prisma.scrimRequest.findUnique({ where: { id: request.id } })).toMatchObject({
      status: RequestStatus.CANCELLED,
    });
    expect(await prisma.application.findUnique({ where: { id: application.id } })).toMatchObject({
      status: AppStatus.REJECTED,
      decidedAt: NOW,
    });
    expect(
      await prisma.application.findUnique({ where: { id: withdrawnApplication.id } }),
    ).toMatchObject({ status: AppStatus.WITHDRAWN });
    const deleted = await prisma.notification.findMany({
      where: { requestId: request.id, type: NotifType.REQUEST_DELETED },
    });
    expect(deleted.map((notification) => notification.dedupeKey)).toEqual([
      `REQUEST_DELETED:${request.id}:${pending.team.id}:CAPTAIN_DM`,
    ]);
    await expect(
      deleteRequest({ userId: host.captain.id, requestId: request.id, now: NOW }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("confirmApplication", () => {
  it("books the scrim and writes exactly the expected outbox entries (§6.1)", async () => {
    const host = await createReadyTeam();
    const guest = await createReadyTeam();
    const other = await createReadyTeam();
    const request = await createOpenRequest(host.captain.id);
    const { application } = await apply(guest.captain.id, request.id);
    const { application: otherApplication } = await apply(other.captain.id, request.id);

    const scrim = await confirmApplication({
      userId: host.captain.id,
      requestId: request.id,
      applicationId: application.id,
      now: NOW,
    });

    expect(scrim).toMatchObject({
      hostTeamId: host.team.id,
      guestTeamId: guest.team.id,
      startsAt: REQUEST_STARTS_AT,
      status: ScrimStatus.SCHEDULED,
      feedbackOpensAt: new Date(REQUEST_STARTS_AT.getTime() + 3 * HOUR),
      feedbackDeadline: new Date(REQUEST_STARTS_AT.getTime() + 75 * HOUR),
    });
    expect(await prisma.scrimRequest.findUnique({ where: { id: request.id } })).toMatchObject({
      status: RequestStatus.BOOKED,
    });
    expect(await prisma.application.findUnique({ where: { id: application.id } })).toMatchObject({
      status: AppStatus.ACCEPTED,
      decidedAt: NOW,
    });
    expect(
      await prisma.application.findUnique({ where: { id: otherApplication.id } }),
    ).toMatchObject({ status: AppStatus.REJECTED, decidedAt: NOW });

    const at = (offsetHours: number) =>
      new Date(REQUEST_STARTS_AT.getTime() + offsetHours * HOUR).toISOString();
    const scrimEntries = (type: string, scheduledFor: string) =>
      [host.team.id, guest.team.id].flatMap((teamId) =>
        ["CAPTAIN_DM", "TEAM_CHANNEL"].map(
          (channel) => `${type}:${scrim.id}:${teamId}:${channel}@${scheduledFor}`,
        ),
      );
    const expected = [
      `APPLICATION_RECEIVED:${application.id}:${host.team.id}:CAPTAIN_DM@${NOW.toISOString()}`,
      `APPLICATION_RECEIVED:${otherApplication.id}:${host.team.id}:CAPTAIN_DM@${NOW.toISOString()}`,
      `APPLICATION_REJECTED:${otherApplication.id}:${other.team.id}:CAPTAIN_DM@${NOW.toISOString()}`,
      ...scrimEntries("SCRIM_BOOKED", NOW.toISOString()),
      ...scrimEntries("REMINDER_24H", at(-24)),
      ...scrimEntries("REMINDER_1H", at(-1)),
      ...scrimEntries("FEEDBACK_PROMPT", at(3)),
    ];
    const notifications = await prisma.notification.findMany({
      where: { OR: [{ requestId: request.id }, { scrimId: scrim.id }] },
    });
    expect(
      notifications.map((n) => `${n.dedupeKey}@${n.scheduledFor.toISOString()}`).sort(),
    ).toEqual(expected.sort());
    expect(notifications.every((n) => n.status === NotifStatus.PENDING)).toBe(true);
    const booked = notifications.find(
      (n) => n.type === NotifType.SCRIM_BOOKED && n.targetTeamId === host.team.id,
    );
    expect(booked?.payload).toEqual({
      opponentTeamName: guest.team.name,
      startsAt: REQUEST_STARTS_AT.toISOString(),
      format: "ONE_MAP",
    });
  });

  it("skips reminders whose time has already passed", async () => {
    const host = await createReadyTeam();
    const guest = await createReadyTeam();
    const request = await createOpenRequest(host.captain.id, SOON);
    expect(request.startsAt).toEqual(SOON_STARTS_AT);
    const { application } = await apply(guest.captain.id, request.id);
    const scrim = await confirmApplication({
      userId: host.captain.id,
      requestId: request.id,
      applicationId: application.id,
      now: NOW,
    });
    const types = await prisma.notification.groupBy({
      by: ["type"],
      where: { scrimId: scrim.id },
      _count: { _all: true },
    });
    expect(Object.fromEntries(types.map((row) => [row.type, row._count._all]))).toEqual({
      SCRIM_BOOKED: 4,
      REMINDER_1H: 4,
      FEEDBACK_PROMPT: 4,
    });
  });

  it("fails clearly if the applicant team is no longer ready or active", async () => {
    const host = await createReadyTeam();
    const guest = await createReadyTeam();
    const request = await createOpenRequest(host.captain.id);
    const { application } = await apply(guest.captain.id, request.id);
    const confirm = () =>
      confirmApplication({
        userId: host.captain.id,
        requestId: request.id,
        applicationId: application.id,
        now: NOW,
      });

    await prisma.user.update({ where: { id: guest.members[0]!.id }, data: { verifiedAt: null } });
    await expect(confirm()).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("nicht mehr spielbereit"),
    });
    await prisma.user.update({ where: { id: guest.members[0]!.id }, data: { verifiedAt: NOW } });
    await prisma.team.update({ where: { id: guest.team.id }, data: { bannedAt: NOW } });
    await expect(confirm()).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("nicht mehr aktiv"),
    });

    expect(await prisma.application.findUnique({ where: { id: application.id } })).toMatchObject({
      status: AppStatus.PENDING,
    });
    expect(await prisma.scrimRequest.findUnique({ where: { id: request.id } })).toMatchObject({
      status: RequestStatus.OPEN,
    });
    expect(await prisma.scrim.count({ where: { requestId: request.id } })).toBe(0);
  });

  it("rejects an unverified host captain and other teams", async () => {
    const host = await createReadyTeam();
    const guest = await createReadyTeam();
    const request = await createOpenRequest(host.captain.id);
    const { application } = await apply(guest.captain.id, request.id);
    const confirm = (userId: string) =>
      confirmApplication({
        userId,
        requestId: request.id,
        applicationId: application.id,
        now: NOW,
      });
    await expect(confirm(guest.captain.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await prisma.user.update({ where: { id: host.captain.id }, data: { verifiedAt: null } });
    await expect(confirm(host.captain.id)).rejects.toMatchObject({ code: "NOT_VERIFIED" });
  });

  it("rejects withdrawn applications", async () => {
    const host = await createReadyTeam();
    const guest = await createReadyTeam();
    const request = await createOpenRequest(host.captain.id);
    const { application } = await apply(guest.captain.id, request.id);
    await withdrawApplication({
      userId: guest.captain.id,
      applicationId: application.id,
      now: NOW,
    });
    await expect(
      confirmApplication({
        userId: host.captain.id,
        requestId: request.id,
        applicationId: application.id,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("concurrency (§7)", () => {
  it("books exactly one scrim for two parallel confirmations", async () => {
    const host = await createReadyTeam();
    const request = await createOpenRequest(host.captain.id);
    const first = await apply((await createReadyTeam()).captain.id, request.id);
    const second = await apply((await createReadyTeam()).captain.id, request.id);
    const results = await Promise.allSettled(
      [first, second].map(({ application }) =>
        confirmApplication({
          userId: host.captain.id,
          requestId: request.id,
          applicationId: application.id,
          now: NOW,
        }),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "CONFLICT" },
    });
    expect(await prisma.scrim.count({ where: { requestId: request.id } })).toBe(1);
    expect(
      await prisma.application.count({
        where: { requestId: request.id, status: AppStatus.ACCEPTED },
      }),
    ).toBe(1);
  });

  it("leaves no pending application on a booked request with parallel apply and confirm", async () => {
    for (let round = 0; round < 3; round++) {
      const host = await createReadyTeam();
      const guest = await createReadyTeam();
      const late = await createReadyTeam();
      const request = await createOpenRequest(host.captain.id);
      const { application } = await apply(guest.captain.id, request.id);
      await Promise.allSettled([
        apply(late.captain.id, request.id),
        confirmApplication({
          userId: host.captain.id,
          requestId: request.id,
          applicationId: application.id,
          now: NOW,
        }),
      ]);
      expect(await prisma.scrimRequest.findUnique({ where: { id: request.id } })).toMatchObject({
        status: RequestStatus.BOOKED,
      });
      expect(
        await prisma.application.count({
          where: { requestId: request.id, status: AppStatus.PENDING },
        }),
      ).toBe(0);
    }
  });
});

describe("expireRequests", () => {
  it("expires open requests at their start and notifies pending applicants", async () => {
    const host = await createReadyTeam();
    const guest = await createReadyTeam();
    const start = new Date("2026-10-23T09:00:00Z");
    const due = await createOpenRequest(host.captain.id, { date: "2026-10-23", time: "11:00" });
    const later = await createOpenRequest(host.captain.id, { date: "2026-10-23", time: "11:15" });
    expect(due.startsAt).toEqual(start);
    const { application } = await apply(guest.captain.id, due.id);

    expect(await expireRequests(start)).toBeGreaterThanOrEqual(1);

    expect(await prisma.scrimRequest.findUnique({ where: { id: due.id } })).toMatchObject({
      status: RequestStatus.EXPIRED,
    });
    expect(await prisma.scrimRequest.findUnique({ where: { id: later.id } })).toMatchObject({
      status: RequestStatus.OPEN,
    });
    expect(await prisma.application.findUnique({ where: { id: application.id } })).toMatchObject({
      status: AppStatus.REJECTED,
      decidedAt: start,
    });
    const expired = await prisma.notification.findMany({
      where: { requestId: due.id, type: NotifType.REQUEST_EXPIRED },
    });
    expect(expired.map((notification) => notification.dedupeKey)).toEqual([
      `REQUEST_EXPIRED:${due.id}:${guest.team.id}:CAPTAIN_DM`,
    ]);
    // Idempotent: a second run changes nothing for this request.
    await expireRequests(start);
    expect(
      await prisma.notification.count({
        where: { requestId: due.id, type: NotifType.REQUEST_EXPIRED },
      }),
    ).toBe(1);
  });
});
