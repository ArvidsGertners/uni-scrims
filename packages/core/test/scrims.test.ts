import {
  FeedbackOutcome,
  NotifStatus,
  NotifType,
  AppStatus,
  RequestStatus,
  ScrimStatus,
  prisma,
  StaffRole,
} from "@uni-scrims/db";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type FeedbackSide,
  type ScrimOutcome,
  applyToRequest,
  cancelScrim,
  deleteRequest,
  expireRequests,
  leaveTeam,
  listDisputes,
  openFeedback,
  resolveDeadlines,
  resolveDispute,
  resolveScrimOutcome,
  retireTeamActivity,
  submitFeedback,
} from "../src/index.ts";
import {
  activeTeamId,
  NOW,
  REQUEST_STARTS_AT,
  SOON,
  bookScrim,
  createOpenRequest,
  createReadyTeam,
  createUser,
} from "./helpers.ts";

const HOUR = 60 * 60 * 1000;
const { PLAYED, OPPONENT_NO_SHOW, WE_COULD_NOT } = FeedbackOutcome;
const AFTER_START = new Date(REQUEST_STARTS_AT.getTime() + HOUR);
const DEADLINE = new Date(REQUEST_STARTS_AT.getTime() + 75 * HOUR);

describe("resolveScrimOutcome (table §5.6)", () => {
  const A = "team-a";
  const B = "team-b";
  type Row = [FeedbackOutcome | null, FeedbackOutcome | null, boolean, ScrimOutcome | null];
  const done = (status: ScrimOutcome["status"], noShowTeamId: string | null = null) => ({
    status,
    noShowTeamId,
  });
  const rows: Row[] = [
    [PLAYED, PLAYED, false, done(ScrimStatus.COMPLETED)],
    [PLAYED, null, true, done(ScrimStatus.COMPLETED)],
    [PLAYED, OPPONENT_NO_SHOW, false, done(ScrimStatus.DISPUTED)],
    [PLAYED, WE_COULD_NOT, false, done(ScrimStatus.DISPUTED)],
    [OPPONENT_NO_SHOW, null, true, done(ScrimStatus.NO_SHOW, B)],
    [OPPONENT_NO_SHOW, WE_COULD_NOT, false, done(ScrimStatus.NO_SHOW, B)],
    [OPPONENT_NO_SHOW, OPPONENT_NO_SHOW, false, done(ScrimStatus.DISPUTED)],
    [WE_COULD_NOT, null, true, done(ScrimStatus.NO_SHOW, A)],
    [WE_COULD_NOT, WE_COULD_NOT, false, done(ScrimStatus.UNCONFIRMED)],
    [null, null, true, done(ScrimStatus.UNCONFIRMED)],
    [PLAYED, null, false, null],
    [OPPONENT_NO_SHOW, null, false, null],
    [WE_COULD_NOT, null, false, null],
    [null, null, false, null],
  ];
  const swapTeam = (result: ScrimOutcome | null) =>
    result && {
      ...result,
      noShowTeamId: result.noShowTeamId === A ? B : result.noShowTeamId === B ? A : null,
    };

  it.each(rows)("A=%s, B=%s, deadline=%s", (a, b, deadlineReached, expected) => {
    const sideA: FeedbackSide = { teamId: A, outcome: a };
    const sideB: FeedbackSide = { teamId: B, outcome: b };
    expect(resolveScrimOutcome(sideA, sideB, deadlineReached)).toEqual(expected);
    // Symmetric: swapping the sides swaps the no-show team.
    expect(
      resolveScrimOutcome({ teamId: A, outcome: b }, { teamId: B, outcome: a }, deadlineReached),
    ).toEqual(swapTeam(expected));
    // Two answers decide immediately, the deadline does not matter.
    if (a && b) expect(resolveScrimOutcome(sideA, sideB, true)).toEqual(expected);
  });
});

describe("cancelScrim", () => {
  it("cancels early without counting as late and notifies the other team", async () => {
    const { host, guest, request, scrim } = await bookScrim();
    await expect(
      cancelScrim({ userId: guest.captain.id, teamId: guest.team.id, scrimId: scrim.id, now: NOW }),
    ).resolves.toEqual({ lateCancel: false });

    expect(await prisma.scrim.findUnique({ where: { id: scrim.id } })).toMatchObject({
      status: ScrimStatus.CANCELLED,
      cancelledByTeamId: guest.team.id,
      cancelledAt: NOW,
      lateCancel: false,
    });
    expect(await prisma.scrimRequest.findUnique({ where: { id: request.id } })).toMatchObject({
      status: RequestStatus.BOOKED,
    });
    const notifications = await prisma.notification.findMany({ where: { scrimId: scrim.id } });
    const pending = notifications.filter((n) => n.status === NotifStatus.PENDING);
    expect(pending.map((n) => n.dedupeKey).sort()).toEqual([
      `SCRIM_CANCELLED:${scrim.id}:${host.team.id}:PERSONAL`,
      `SCRIM_CANCELLED:${scrim.id}:${host.team.id}:TEAM_CHANNEL`,
    ]);
    // Booking confirmation, reminders and feedback prompt are dropped; their retention counts from
    // the cancellation, not from a send planned for later (ARCHITECTURE §6.3).
    const cancelled = notifications.filter((n) => n.status === NotifStatus.CANCELLED);
    expect(cancelled).toHaveLength(16);
    expect(new Set(cancelled.map((n) => n.scheduledFor.getTime()))).toEqual(
      new Set([NOW.getTime()]),
    );
  });

  it("marks cancellations less than 24 h before the start as late", async () => {
    const { host, scrim } = await bookScrim(SOON);
    await expect(
      cancelScrim({ userId: host.captain.id, teamId: host.team.id, scrimId: scrim.id, now: NOW }),
    ).resolves.toEqual({ lateCancel: true });
  });

  it("only works before the start, once, and for the captains of both teams", async () => {
    const { host, guest, scrim } = await bookScrim();
    const cancel = async (userId: string, now = NOW) =>
      cancelScrim({ userId, teamId: await activeTeamId(userId), scrimId: scrim.id, now });
    const outsider = await createReadyTeam();
    await expect(cancel(outsider.captain.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(cancel(guest.members[0]!.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(cancel(host.captain.id, REQUEST_STARTS_AT)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await prisma.user.update({ where: { id: host.captain.id }, data: { verifiedAt: null } });
    await expect(cancel(host.captain.id)).rejects.toMatchObject({ code: "NOT_VERIFIED" });
    await cancel(guest.captain.id);
    await expect(cancel(guest.captain.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("submitFeedback", () => {
  const feedback = (
    userId: string,
    scrimId: string,
    outcome: FeedbackOutcome,
    rating: number | null = null,
    now = AFTER_START,
  ) =>
    activeTeamId(userId).then((teamId) =>
      submitFeedback({ userId, teamId, scrimId, outcome, rating, now }),
    );

  it("accepts feedback from the start time and evaluates once both teams answered", async () => {
    const { host, guest, scrim } = await bookScrim();
    await expect(feedback(host.captain.id, scrim.id, PLAYED, 5, NOW)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(feedback(host.captain.id, scrim.id, PLAYED, 4)).resolves.toEqual({
      result: null,
    });
    expect(await prisma.scrim.findUnique({ where: { id: scrim.id } })).toMatchObject({
      status: ScrimStatus.AWAITING_FEEDBACK,
    });
    await expect(feedback(guest.captain.id, scrim.id, OPPONENT_NO_SHOW)).resolves.toEqual({
      result: { status: ScrimStatus.DISPUTED, noShowTeamId: null },
    });
    expect(await prisma.scrim.findUnique({ where: { id: scrim.id } })).toMatchObject({
      status: ScrimStatus.DISPUTED,
    });
    expect(
      await prisma.scrimFeedback.findUnique({
        where: { scrimId_teamId: { scrimId: scrim.id, teamId: host.team.id } },
      }),
    ).toMatchObject({ outcome: PLAYED, rating: 4, submittedById: host.captain.id });
  });

  it("records a no-show of the team that could not play", async () => {
    const { host, guest, scrim } = await bookScrim();
    await feedback(host.captain.id, scrim.id, WE_COULD_NOT);
    await feedback(guest.captain.id, scrim.id, OPPONENT_NO_SHOW);
    expect(await prisma.scrim.findUnique({ where: { id: scrim.id } })).toMatchObject({
      status: ScrimStatus.NO_SHOW,
      noShowTeamId: host.team.id,
    });
  });

  it("requires a rating exactly for PLAYED", async () => {
    const { host, scrim } = await bookScrim();
    await expect(feedback(host.captain.id, scrim.id, PLAYED)).rejects.toMatchObject({
      code: "INVALID",
    });
    await expect(feedback(host.captain.id, scrim.id, PLAYED, 6)).rejects.toMatchObject({
      code: "INVALID",
    });
    await expect(feedback(host.captain.id, scrim.id, WE_COULD_NOT, 3)).rejects.toMatchObject({
      code: "INVALID",
    });
  });

  it("allows one unchangeable answer per team and none after the result", async () => {
    const { host, guest, scrim } = await bookScrim();
    await feedback(host.captain.id, scrim.id, PLAYED, 5);
    await expect(feedback(host.captain.id, scrim.id, WE_COULD_NOT)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Ihr habt schon geantwortet.",
    });
    await feedback(guest.captain.id, scrim.id, PLAYED, 5);
    await expect(feedback(guest.captain.id, scrim.id, PLAYED, 5)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Feedback bereits abgeschlossen.",
    });
  });

  it("rejects answers after the deadline, for cancelled scrims and from unverified captains", async () => {
    const { host, guest, scrim } = await bookScrim();
    await expect(feedback(host.captain.id, scrim.id, PLAYED, 5, DEADLINE)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Die Feedback-Frist ist abgelaufen.",
    });
    await prisma.user.update({ where: { id: guest.captain.id }, data: { verifiedAt: null } });
    await expect(feedback(guest.captain.id, scrim.id, PLAYED, 5)).rejects.toMatchObject({
      code: "NOT_VERIFIED",
    });
    await expect(feedback(guest.members[0]!.id, scrim.id, PLAYED, 5)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const cancelled = await bookScrim();
    await cancelScrim({
      userId: cancelled.host.captain.id,
      teamId: cancelled.host.team.id,
      scrimId: cancelled.scrim.id,
      now: NOW,
    });
    await expect(
      feedback(cancelled.guest.captain.id, cancelled.scrim.id, PLAYED, 5),
    ).rejects.toMatchObject({ code: "CONFLICT", message: "Der Scrim wurde abgesagt." });
  });

  it("completes immediately with two parallel PLAYED answers (§7)", async () => {
    const { host, guest, scrim } = await bookScrim();
    const results = await Promise.allSettled([
      feedback(host.captain.id, scrim.id, PLAYED, 5),
      feedback(guest.captain.id, scrim.id, PLAYED, 4),
    ]);
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect(await prisma.scrim.findUnique({ where: { id: scrim.id } })).toMatchObject({
      status: ScrimStatus.COMPLETED,
    });
  });
});

describe("sweeper steps", () => {
  it("opens feedback at feedbackOpensAt", async () => {
    const { scrim } = await bookScrim();
    await openFeedback(new Date(scrim.feedbackOpensAt.getTime() - 1));
    expect(await prisma.scrim.findUnique({ where: { id: scrim.id } })).toMatchObject({
      status: ScrimStatus.SCHEDULED,
    });
    await openFeedback(scrim.feedbackOpensAt);
    expect(await prisma.scrim.findUnique({ where: { id: scrim.id } })).toMatchObject({
      status: ScrimStatus.AWAITING_FEEDBACK,
    });
  });

  it("evaluates at the deadline with the answers that are there", async () => {
    const playedOnly = await bookScrim();
    await submitFeedback({
      userId: playedOnly.host.captain.id,
      teamId: playedOnly.host.team.id,
      scrimId: playedOnly.scrim.id,
      outcome: PLAYED,
      rating: 5,
      now: AFTER_START,
    });
    const noShowOnly = await bookScrim();
    await submitFeedback({
      userId: noShowOnly.guest.captain.id,
      teamId: noShowOnly.guest.team.id,
      scrimId: noShowOnly.scrim.id,
      outcome: OPPONENT_NO_SHOW,
      now: AFTER_START,
    });
    const silent = await bookScrim();

    await openFeedback(DEADLINE);
    await resolveDeadlines(new Date(DEADLINE.getTime() - 1));
    expect(await prisma.scrim.findUnique({ where: { id: silent.scrim.id } })).toMatchObject({
      status: ScrimStatus.AWAITING_FEEDBACK,
    });
    expect(await resolveDeadlines(DEADLINE)).toBeGreaterThanOrEqual(3);

    expect(await prisma.scrim.findUnique({ where: { id: playedOnly.scrim.id } })).toMatchObject({
      status: ScrimStatus.COMPLETED,
    });
    expect(await prisma.scrim.findUnique({ where: { id: noShowOnly.scrim.id } })).toMatchObject({
      status: ScrimStatus.NO_SHOW,
      noShowTeamId: noShowOnly.host.team.id,
    });
    expect(await prisma.scrim.findUnique({ where: { id: silent.scrim.id } })).toMatchObject({
      status: ScrimStatus.UNCONFIRMED,
      noShowTeamId: null,
    });
  });
});

describe("resolveDispute", () => {
  let admin: Awaited<ReturnType<typeof createUser>>;

  beforeAll(async () => {
    admin = await createUser({ verified: true, staffRole: StaffRole.ADMIN });
  });

  async function dispute() {
    const booked = await bookScrim();
    for (const [side, outcome] of [
      [booked.host, PLAYED],
      [booked.guest, OPPONENT_NO_SHOW],
    ] as const) {
      await submitFeedback({
        userId: side.captain.id,
        teamId: side.team.id,
        scrimId: booked.scrim.id,
        outcome,
        rating: outcome === PLAYED ? 3 : null,
        now: AFTER_START,
      });
    }
    return booked;
  }

  it("lets an admin decide on a no-show", async () => {
    const { host, guest, scrim } = await dispute();
    const decide = (adminId: string, noShowTeamId: string) =>
      resolveDispute({
        adminId,
        scrimId: scrim.id,
        decision: "NO_SHOW",
        noShowTeamId,
        now: DEADLINE,
      });
    await expect(decide(host.captain.id, guest.team.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(decide(admin.id, "other-team")).rejects.toMatchObject({ code: "INVALID" });
    await decide(admin.id, guest.team.id);
    expect(await prisma.scrim.findUnique({ where: { id: scrim.id } })).toMatchObject({
      status: ScrimStatus.NO_SHOW,
      noShowTeamId: guest.team.id,
      resolvedById: admin.id,
      resolvedAt: DEADLINE,
    });
    await expect(decide(admin.id, guest.team.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("maps played and unclear to completed and unconfirmed", async () => {
    const played = await dispute();
    await resolveDispute({
      adminId: admin.id,
      scrimId: played.scrim.id,
      decision: "PLAYED",
      now: DEADLINE,
    });
    const unclear = await dispute();
    await resolveDispute({
      adminId: admin.id,
      scrimId: unclear.scrim.id,
      decision: "UNCLEAR",
      now: DEADLINE,
    });
    expect(await prisma.scrim.findUnique({ where: { id: played.scrim.id } })).toMatchObject({
      status: ScrimStatus.COMPLETED,
      noShowTeamId: null,
    });
    expect(await prisma.scrim.findUnique({ where: { id: unclear.scrim.id } })).toMatchObject({
      status: ScrimStatus.UNCONFIRMED,
    });
  });

  it("lists open disputes with both answers for admins only", async () => {
    const { host, guest, scrim } = await dispute();
    await expect(listDisputes(host.captain.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const entry = (await listDisputes(admin.id)).find((item) => item.id === scrim.id);
    expect(entry).toEqual({
      id: scrim.id,
      startsAt: REQUEST_STARTS_AT,
      format: scrim.format,
      maps: scrim.maps,
      host: {
        id: host.team.id,
        name: host.team.name,
        tag: host.team.tag,
        captainName: host.captain.name,
        feedback: { teamId: host.team.id, outcome: PLAYED, rating: 3, createdAt: AFTER_START },
      },
      guest: {
        id: guest.team.id,
        name: guest.team.name,
        tag: guest.team.tag,
        captainName: guest.captain.name,
        feedback: {
          teamId: guest.team.id,
          outcome: OPPONENT_NO_SHOW,
          rating: null,
          createdAt: AFTER_START,
        },
      },
    });
    await resolveDispute({
      adminId: admin.id,
      scrimId: scrim.id,
      decision: "PLAYED",
      now: DEADLINE,
    });
    expect((await listDisputes(admin.id)).map((item) => item.id)).not.toContain(scrim.id);
  });
});

describe("retireTeamActivity", () => {
  it("cancels requests, withdraws applications and cancels future scrims without late flag", async () => {
    // Team X hosts a scrim within 24 h, has an open request with an applicant and has applied elsewhere.
    const { host: x, guest: opponent, scrim } = await bookScrim(SOON);
    const applicant = await createReadyTeam();
    const ownRequest = await createOpenRequest(x.captain.id);
    await applyToRequest({
      userId: applicant.captain.id,
      teamId: applicant.team.id,
      requestId: ownRequest.id,
      now: NOW,
    });
    const elsewhere = await createReadyTeam();
    const foreignRequest = await createOpenRequest(elsewhere.captain.id);
    const { application } = await applyToRequest({
      userId: x.captain.id,
      teamId: x.team.id,
      requestId: foreignRequest.id,
      now: NOW,
    });

    await retireTeamActivity(x.team.id, NOW);

    expect(await prisma.scrimRequest.findUnique({ where: { id: ownRequest.id } })).toMatchObject({
      status: RequestStatus.CANCELLED,
    });
    expect(
      await prisma.notification.findMany({
        where: { requestId: ownRequest.id, type: NotifType.REQUEST_DELETED },
        select: { targetTeamId: true },
      }),
    ).toEqual([{ targetTeamId: applicant.team.id }]);
    expect(await prisma.application.findUnique({ where: { id: application.id } })).toMatchObject({
      status: AppStatus.WITHDRAWN,
    });
    expect(await prisma.scrim.findUnique({ where: { id: scrim.id } })).toMatchObject({
      status: ScrimStatus.CANCELLED,
      cancelledByTeamId: x.team.id,
      lateCancel: false,
    });
    expect(
      await prisma.notification.findMany({
        where: { scrimId: scrim.id, status: NotifStatus.PENDING },
        select: { type: true, targetTeamId: true },
      }),
    ).toEqual([
      { type: NotifType.SCRIM_CANCELLED, targetTeamId: opponent.team.id },
      { type: NotifType.SCRIM_CANCELLED, targetTeamId: opponent.team.id },
    ]);
  });

  it("runs when the last member dissolves the team", async () => {
    const { host: x, scrim } = await bookScrim();
    await prisma.teamMember.deleteMany({
      where: { teamId: x.team.id, userId: { not: x.captain.id } },
    });
    await expect(leaveTeam({ userId: x.captain.id, teamId: x.team.id, now: NOW })).resolves.toEqual(
      {
        dissolved: true,
      },
    );
    expect(await prisma.scrim.findUnique({ where: { id: scrim.id } })).toMatchObject({
      status: ScrimStatus.CANCELLED,
      cancelledByTeamId: x.team.id,
      lateCancel: false,
    });
  });

  it("does not deadlock with parallel applications and deletions while a team dissolves", async () => {
    for (let round = 0; round < 10; round++) {
      // Applying to the dissolving team's request (FK checks on its Team row).
      const host = await createReadyTeam();
      await prisma.teamMember.deleteMany({
        where: { teamId: host.team.id, userId: { not: host.captain.id } },
      });
      const ownRequest = await prisma.scrimRequest.create({
        data: {
          teamId: host.team.id,
          createdById: host.captain.id,
          startsAt: REQUEST_STARTS_AT,
          format: "ONE_MAP",
          rankMin: "IRON",
          rankMax: "RADIANT",
          maps: [],
          status: RequestStatus.OPEN,
          createdAt: NOW,
        },
      });
      const applicant = await createReadyTeam();
      // Deleting a request the dissolving team applied to (its application and notification).
      const leaving = await createReadyTeam();
      const other = await createReadyTeam();
      const foreignRequest = await createOpenRequest(other.captain.id);
      await applyToRequest({
        userId: leaving.captain.id,
        teamId: leaving.team.id,
        requestId: foreignRequest.id,
        now: NOW,
      });
      await prisma.teamMember.deleteMany({
        where: { teamId: leaving.team.id, userId: { not: leaving.captain.id } },
      });

      const results = await Promise.allSettled([
        applyToRequest({
          userId: applicant.captain.id,
          teamId: applicant.team.id,
          requestId: ownRequest.id,
          now: NOW,
        }),
        leaveTeam({ userId: host.captain.id, teamId: host.team.id, now: NOW }),
        deleteRequest({ userId: other.captain.id, requestId: foreignRequest.id, now: NOW }),
        leaveTeam({ userId: leaving.captain.id, teamId: leaving.team.id, now: NOW }),
      ]);
      // Domain errors (e.g. "nicht mehr offen") are fine; a deadlock is not.
      for (const result of results) {
        if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "CONFLICT" });
      }
      expect(results[1]).toMatchObject({ status: "fulfilled" });
      expect(results[3]).toMatchObject({ status: "fulfilled" });
    }
  });

  it("leaves scrims that have already started alone", async () => {
    const { host: x, scrim } = await bookScrim();
    await retireTeamActivity(x.team.id, AFTER_START);
    expect(await prisma.scrim.findUnique({ where: { id: scrim.id } })).toMatchObject({
      status: ScrimStatus.SCHEDULED,
    });
  });

  it("leaves requests that have started to the sweeper, which lets them expire", async () => {
    // The sweeper has not run yet: X's request and the one X applied to are still OPEN after
    // their start.
    const x = await createReadyTeam();
    const applicant = await createReadyTeam();
    const ownRequest = await createOpenRequest(x.captain.id);
    const { application: received } = await applyToRequest({
      userId: applicant.captain.id,
      teamId: applicant.team.id,
      requestId: ownRequest.id,
      now: NOW,
    });
    const elsewhere = await createReadyTeam();
    const foreignRequest = await createOpenRequest(elsewhere.captain.id);
    const { application: sent } = await applyToRequest({
      userId: x.captain.id,
      teamId: x.team.id,
      requestId: foreignRequest.id,
      now: NOW,
    });

    await retireTeamActivity(x.team.id, AFTER_START);

    for (const request of [ownRequest, foreignRequest]) {
      expect(await prisma.scrimRequest.findUnique({ where: { id: request.id } })).toMatchObject({
        status: RequestStatus.OPEN,
      });
    }
    expect(
      await prisma.application.count({
        where: { id: { in: [received.id, sent.id] }, status: AppStatus.PENDING },
      }),
    ).toBe(2);

    await expireRequests(AFTER_START);
    expect(await prisma.scrimRequest.findUnique({ where: { id: ownRequest.id } })).toMatchObject({
      status: RequestStatus.EXPIRED,
    });
    expect(
      await prisma.notification.findMany({
        where: { requestId: ownRequest.id },
        select: { type: true, targetTeamId: true },
      }),
    ).toEqual([
      { type: NotifType.APPLICATION_RECEIVED, targetTeamId: x.team.id },
      { type: NotifType.REQUEST_EXPIRED, targetTeamId: applicant.team.id },
    ]);
    expect(await prisma.application.findUnique({ where: { id: sent.id } })).toMatchObject({
      status: AppStatus.REJECTED,
    });
  });
});
