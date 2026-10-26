import { AppStatus, MemberRole, RequestStatus, prisma } from "@uni-scrims/db";
import { afterAll, describe, expect, it } from "vitest";
import {
  applyToRequest,
  confirmApplication,
  getAccount,
  getBoard,
  getMyTeam,
  getNavTeam,
  getTeamList,
  setVerifiedApplicantsOnly,
} from "../src/index.ts";
import {
  NOW,
  createFullyVerifiedTeam,
  createOpenRequest,
  createTeamWithMembers,
  createUser,
} from "./helpers.ts";

// Phase 25 (SPEC N-21, §5.24): a verified captain is enough, the badge, its filters and the
// setting that admits only fully verified applicants.

afterAll(async () => {
  await prisma.$disconnect();
});

/** Five letters from g–z, never part of other test teams' hex IDs: a search finds only ours. */
function token(): string {
  const letters = "ghijklmnopqrstuvwxyz";
  return Array.from({ length: 5 }, () => letters[Math.floor(Math.random() * 20)]).join("");
}

async function rename(teamId: string, name: string) {
  await prisma.team.update({
    where: { id: teamId },
    data: { name, nameNormalized: name.toLowerCase() },
  });
}

function apply(userId: string, teamId: string, requestId: string) {
  return applyToRequest({ userId, teamId, requestId, now: NOW });
}

describe("a verified captain is enough (SPEC N-21)", () => {
  it("lets two teams with only a verified captain post, apply and book", async () => {
    const host = await createTeamWithMembers();
    const guest = await createTeamWithMembers({ extraMembers: 2, verifiedMembers: false });
    const request = await createOpenRequest(host.captain.id);
    const { application } = await apply(guest.captain.id, guest.team.id, request.id);
    const scrim = await confirmApplication({
      userId: host.captain.id,
      requestId: request.id,
      applicationId: application.id,
      now: NOW,
    });
    expect(scrim).toMatchObject({ hostTeamId: host.team.id, guestTeamId: guest.team.id });
    expect(await prisma.scrimRequest.findUnique({ where: { id: request.id } })).toMatchObject({
      status: RequestStatus.BOOKED,
    });
  });
});

describe("the badge and its filters", () => {
  it("shows the badge on board cards and filters the board by it", async () => {
    const full = await createFullyVerifiedTeam();
    const alone = await createTeamWithMembers();
    // A verified coach as fifth member: no badge (SPEC N-1).
    const coached = await createFullyVerifiedTeam();
    await prisma.teamMember.updateMany({
      where: { userId: coached.members[0]!.id },
      data: { role: MemberRole.COACH },
    });
    await prisma.team.update({
      where: { id: full.team.id },
      data: { verifiedApplicantsOnly: true },
    });
    const requests = await Promise.all(
      [full, alone, coached].map((team) => createOpenRequest(team.captain.id)),
    );
    const ids = new Set(requests.map((request) => request.id));
    const viewer = await createUser();
    const board = async (fullyVerifiedOnly?: boolean) => {
      const result = await getBoard({ userId: viewer.id, fullyVerifiedOnly, now: NOW });
      return {
        filter: result.filter,
        cards: result.requests.filter((card) => ids.has(card.id)),
      };
    };

    const all = await board();
    expect(all.filter.fullyVerifiedOnly).toBe(false);
    expect(
      Object.fromEntries(
        all.cards.map((card) => [
          card.team.id,
          [card.team.fullyVerified, card.verifiedApplicantsOnly] as const,
        ]),
      ),
    ).toEqual({
      [full.team.id]: [true, true],
      [alone.team.id]: [false, false],
      [coached.team.id]: [false, false],
    });

    const filtered = await board(true);
    expect(filtered.filter.fullyVerifiedOnly).toBe(true);
    expect(filtered.cards.map((card) => card.team.id)).toEqual([full.team.id]);
  });

  it("shows the badge in the teams list and filters by it", async () => {
    const tok = token();
    const full = await createFullyVerifiedTeam();
    const substitute = await createFullyVerifiedTeam();
    await prisma.teamMember.updateMany({
      where: { userId: substitute.members[0]!.id },
      data: { role: MemberRole.SUBSTITUTE },
    });
    const unverified = await createTeamWithMembers({ extraMembers: 4, verifiedMembers: false });
    await rename(full.team.id, `${tok} Alpha`);
    await rename(substitute.team.id, `${tok} Beta`);
    await rename(unverified.team.id, `${tok} Gamma`);
    const viewer = await createUser();

    const all = await getTeamList({ userId: viewer.id, search: tok });
    expect(all.filter.fullyVerifiedOnly).toBe(false);
    expect(all.teams.map((team) => [team.id, team.fullyVerified])).toEqual([
      [full.team.id, true],
      // Substitutes count (SPEC N-1).
      [substitute.team.id, true],
      [unverified.team.id, false],
    ]);
    const filtered = await getTeamList({ userId: viewer.id, search: tok, fullyVerifiedOnly: true });
    expect(filtered.filter.fullyVerifiedOnly).toBe(true);
    expect(filtered.teams.map((team) => team.id)).toEqual([full.team.id, substitute.team.id]);
  });
});

describe("setVerifiedApplicantsOnly (§5.24)", () => {
  it("lets the captain admit only fully verified teams, also without own verification", async () => {
    const host = await createTeamWithMembers({ extraMembers: 1, verifiedCaptain: false });
    const set = (value: boolean) =>
      setVerifiedApplicantsOnly({ userId: host.captain.id, teamId: host.team.id, value });
    expect(await getMyTeam(host.members[0]!.id)).toMatchObject({ verifiedApplicantsOnly: false });

    await set(true);
    expect(await getMyTeam(host.members[0]!.id)).toMatchObject({ verifiedApplicantsOnly: true });
    // The same value again changes nothing.
    await set(true);
    await set(false);
    expect(await getMyTeam(host.members[0]!.id)).toMatchObject({ verifiedApplicantsOnly: false });
  });

  it("rejects members, other captains, banned teams and invalid values", async () => {
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 1 });
    const set = (userId: string) =>
      setVerifiedApplicantsOnly({ userId, teamId: team.id, value: true });

    await expect(set(members[0]!.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const other = await createTeamWithMembers();
    await expect(set(other.captain.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      setVerifiedApplicantsOnly({
        userId: captain.id,
        teamId: team.id,
        value: "yes" as unknown as boolean,
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    await prisma.team.update({ where: { id: team.id }, data: { bannedAt: NOW } });
    await expect(set(captain.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Das Team ist gesperrt.",
    });
    const row = await prisma.team.findUniqueOrThrow({ where: { id: team.id } });
    expect(row.verifiedApplicantsOnly).toBe(false);
  });

  it("is checked when applying and again when confirming", async () => {
    const host = await createTeamWithMembers();
    const request = await createOpenRequest(host.captain.id);
    const alone = await createTeamWithMembers();
    // Applied before the captain turned the setting on: stays pending, cannot be confirmed.
    const { application } = await apply(alone.captain.id, alone.team.id, request.id);
    await setVerifiedApplicantsOnly({ userId: host.captain.id, teamId: host.team.id, value: true });

    const late = await createTeamWithMembers();
    await expect(apply(late.captain.id, late.team.id, request.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
      text: { key: "applicantsMustBeFullyVerified", params: { team: host.team.name } },
    });
    const full = await createFullyVerifiedTeam();
    const { application: accepted } = await apply(full.captain.id, full.team.id, request.id);

    const confirm = (applicationId: string) =>
      confirmApplication({
        userId: host.captain.id,
        requestId: request.id,
        applicationId,
        now: NOW,
      });
    await expect(confirm(application.id)).rejects.toMatchObject({
      code: "CONFLICT",
      text: { key: "applicantTeamNotFullyVerified", params: { team: alone.team.name } },
    });
    expect(await prisma.application.findUnique({ where: { id: application.id } })).toMatchObject({
      status: AppStatus.PENDING,
    });
    await expect(confirm(accepted.id)).resolves.toMatchObject({ guestTeamId: full.team.id });
  });
});

describe("warning dot (SPEC N-21)", () => {
  it("is only for unverified captains of an active team", async () => {
    const dot = async (userId: string) => ({
      nav: (await getNavTeam(userId)).verificationNeeded,
      account: (await getAccount(userId)).verificationNeeded,
    });
    const unverifiedCaptain = await createTeamWithMembers({
      extraMembers: 1,
      verifiedCaptain: false,
      verifiedMembers: false,
    });
    expect(await dot(unverifiedCaptain.captain.id)).toEqual({ nav: true, account: true });
    // An unverified player needs no verification for scrims.
    expect(await dot(unverifiedCaptain.members[0]!.id)).toEqual({ nav: false, account: false });
    // Without a team nobody needs it either.
    expect(await dot((await createUser({ verified: false })).id)).toEqual({
      nav: false,
      account: false,
    });
    const verifiedCaptain = await createTeamWithMembers();
    expect(await dot(verifiedCaptain.captain.id)).toEqual({ nav: false, account: false });

    // A banned team cannot play anyway.
    await prisma.team.update({
      where: { id: unverifiedCaptain.team.id },
      data: { bannedAt: NOW },
    });
    expect((await getAccount(unverifiedCaptain.captain.id)).verificationNeeded).toBe(false);
  });
});
