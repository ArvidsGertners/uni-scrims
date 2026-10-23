import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  FeedbackOutcome,
  MemberRole,
  NotifChannel,
  NotifStatus,
  NotifType,
  ScrimStatus,
  StaffRole,
  VerifStatus,
  prisma,
} from "@uni-scrims/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { CREDENTIAL_PROVIDER, deleteAccount, exportAccountData } from "../src/index.ts";
import { NOW, bookScrim, createSession, createUser, uid } from "./helpers.ts";

const PRIVACY = "https://uniscrims.example/datenschutz";
const exportOf = (userId: string) =>
  exportAccountData({ userId, now: NOW, privacyPolicyUrl: PRIVACY });
const HOUR = 60 * 60 * 1000;

let uploadDir: string;

beforeEach(async () => {
  uploadDir = await mkdtemp(path.join(tmpdir(), "uni-scrims-export-"));
  return () => rm(uploadDir, { recursive: true, force: true });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function review(
  userId: string,
  data: Partial<{
    status: VerifStatus;
    decidedById: string | null;
    rejectReason: string;
    filePath: string;
    universityId: string;
    createdAt: Date;
  }>,
) {
  return prisma.verificationRequest.create({
    data: {
      userId,
      pendingUserId: data.status === VerifStatus.PENDING ? userId : null,
      mimeType: "application/pdf",
      sizeBytes: 1234,
      status: data.status ?? VerifStatus.PENDING,
      createdAt: data.createdAt ?? NOW,
      decidedAt: data.status === VerifStatus.PENDING ? null : NOW,
      ...data,
    },
  });
}

/**
 * The host captain of a booked scrim with everything an account can have: password, sessions, 2FA,
 * an open reset link, three reviews, a request with a note, feedback, a DM and a dissolved team.
 */
async function fullAccount() {
  const { host, guest, scrim } = await bookScrim({ note: "Lobby über Discord: kontakt#1234" });
  const user = host.captain;
  const university = await prisma.university.create({
    data: { name: "Uni Export", city: "Teststadt", slug: `uni-export-${uid()}` },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { universityId: university.id, staffRole: StaffRole.ADMIN, twoFactorEnabled: true },
  });
  await prisma.account.update({
    where: { id: `${user.id}-discord` },
    data: { accessToken: "SECRET-discord-access", refreshToken: "SECRET-discord-refresh" },
  });
  await prisma.account.create({
    data: {
      id: uid(),
      userId: user.id,
      accountId: user.id,
      providerId: CREDENTIAL_PROVIDER,
      password: "SECRET-password-hash",
    },
  });
  await prisma.session.create({
    data: {
      id: uid(),
      token: `SECRET-session-${uid()}`,
      userId: user.id,
      expiresAt: new Date(NOW.getTime() + 7 * 24 * HOUR),
      ipAddress: "203.0.113.7",
      userAgent: "Firefox Test",
    },
  });
  await prisma.twoFactor.create({
    data: {
      id: uid(),
      userId: user.id,
      secret: "SECRET-totp-key",
      backupCodes: "SECRET-backup-codes",
    },
  });
  await prisma.verification.create({
    data: {
      id: uid(),
      identifier: "reset-password:SECRET-link-token",
      value: user.id,
      expiresAt: new Date(NOW.getTime() + HOUR),
    },
  });

  const reviewer = await createUser({ staffRole: StaffRole.REVIEWER });
  await prisma.user.update({ where: { id: reviewer.id }, data: { lastName: `Prüferin ${uid()}` } });
  await review(user.id, {
    status: VerifStatus.REJECTED,
    rejectReason: "Unleserlich",
    createdAt: new Date(NOW.getTime() - 3 * HOUR),
  });
  await review(user.id, {
    status: VerifStatus.APPROVED,
    decidedById: reviewer.id,
    universityId: university.id,
    createdAt: new Date(NOW.getTime() - 2 * HOUR),
  });
  await review(user.id, {
    status: VerifStatus.PENDING,
    filePath: "pending.pdf",
    createdAt: new Date(NOW.getTime() - HOUR),
  });

  await prisma.scrimFeedback.create({
    data: {
      scrimId: scrim.id,
      teamId: host.team.id,
      submittedById: user.id,
      outcome: FeedbackOutcome.PLAYED,
      rating: 4,
      createdAt: NOW,
    },
  });
  await prisma.notification.create({
    data: {
      type: NotifType.VERIFICATION_RESULT,
      channel: NotifChannel.USER_DM,
      targetUserId: user.id,
      payload: { approved: false, rejectReason: "Unleserlich" },
      scheduledFor: NOW,
      status: NotifStatus.SENT,
      dedupeKey: `export-test:${uid()}`,
      createdAt: NOW,
      sentAt: NOW,
    },
  });
  await prisma.team.create({
    data: {
      id: uid(),
      name: "Altes Team",
      tag: "ALT",
      rank: "SILVER",
      captainId: user.id,
      createdAt: new Date(NOW.getTime() - 48 * HOUR),
      dissolvedAt: new Date(NOW.getTime() - 24 * HOUR),
    },
  });
  return {
    user,
    university,
    host,
    guest,
    reviewer: await prisma.user.findUniqueOrThrow({ where: { id: reviewer.id } }),
  };
}

describe("exportAccountData", () => {
  it("contains every section of §5.10", async () => {
    const { user, university, host, guest } = await fullAccount();
    const data = await exportOf(user.id);

    expect(data.hinweis).toContain(PRIVACY);
    expect(data.erstelltAm).toEqual(NOW);
    expect(data.konto).toMatchObject({
      id: user.id,
      discordName: user.name,
      eMail: user.email,
      eMailBestätigt: true,
      vorname: user.firstName,
      nachname: user.lastName,
      hochschule: university.name,
      verifiziertAm: NOW,
      gesperrtAm: null,
      rolle: "Admin",
      zweiFaktorEingerichtet: true,
    });
    expect(data.anmeldung).toMatchObject({
      discordId: user.discordId,
      passwortGespeichert: true,
    });
    expect(data.sitzungen).toEqual([
      expect.objectContaining({ ipAdresse: "203.0.113.7", browser: "Firefox Test" }),
    ]);
    expect(data.prüfungen).toEqual([
      expect.objectContaining({
        status: "Abgelehnt",
        entschieden: "automatisch",
        ablehnungsgrund: "Unleserlich",
        dateityp: "application/pdf",
        dateigrößeBytes: 1234,
        dateiGespeichert: false,
      }),
      expect.objectContaining({
        status: "Freigegeben",
        entschieden: "von Hand",
        hochschule: university.name,
      }),
      expect.objectContaining({ status: "In Prüfung", entschieden: null, dateiGespeichert: true }),
    ]);
    expect(data.team).toEqual({
      name: host.team.name,
      kürzel: host.team.tag,
      rang: "Gold",
      gesperrtAm: null,
      rolle: "Spieler",
      captain: true,
      beigetretenAm: NOW,
    });
    expect(data.aufgelösteTeams).toEqual([
      expect.objectContaining({ name: "Altes Team", kürzel: "ALT" }),
    ]);
    expect(data.anfragen).toEqual([
      expect.objectContaining({
        team: host.team.name,
        format: "1 Map",
        rangVon: "Silber",
        rangBis: "Platin",
        notiz: "Lobby über Discord: kontakt#1234",
        status: "Gebucht",
      }),
    ]);
    expect(data.feedback).toEqual([
      expect.objectContaining({
        team: host.team.name,
        gegner: guest.team.name,
        antwort: "Hat stattgefunden",
        sterne: 4,
      }),
    ]);
    expect(data.nachrichten).toEqual([
      expect.objectContaining({
        art: "Ergebnis der Verifizierung",
        inhalt: { ergebnis: "Abgelehnt", ablehnungsgrund: "Unleserlich" },
        status: "Gesendet",
      }),
    ]);
    expect(data.verwaltung).toEqual({ prüfungen: [], streitfälle: [] });
  });

  it("leaves out credentials and other people's data", async () => {
    const { user, guest, reviewer } = await fullAccount();
    const json = JSON.stringify(await exportOf(user.id));

    expect(json).not.toContain("SECRET");
    expect(json).not.toContain(reviewer.lastName!);
    for (const other of [reviewer, guest.captain, ...guest.members]) {
      for (const value of [other.id, other.name, other.email]) {
        expect(json).not.toContain(value);
      }
    }
    for (const other of [guest.captain, ...guest.members]) {
      expect(json).not.toContain(other.discordId);
    }
  });

  it("shows staff their own decisions with date and result only", async () => {
    const reviewer = await createUser({ staffRole: StaffRole.REVIEWER });
    const student = await createUser();
    await prisma.user.update({ where: { id: student.id }, data: { lastName: `Student ${uid()}` } });
    await review(student.id, { status: VerifStatus.APPROVED, decidedById: reviewer.id });
    const { scrim } = await bookScrim();
    await prisma.scrim.update({
      where: { id: scrim.id },
      data: { status: ScrimStatus.COMPLETED, resolvedById: reviewer.id, resolvedAt: NOW },
    });

    const data = await exportOf(reviewer.id);
    expect(data.konto).toMatchObject({ rolle: "Prüfer", zweiFaktorEingerichtet: true });
    expect(data.verwaltung).toEqual({
      prüfungen: [{ entschiedenAm: NOW, ergebnis: "Freigegeben" }],
      streitfälle: [{ entschiedenAm: NOW, ergebnis: "Gespielt" }],
    });
    const json = JSON.stringify(data);
    const studentRow = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    for (const value of [student.id, student.name, student.email, studentRow.lastName!]) {
      expect(json).not.toContain(value);
    }
  });

  it("serves banned and incomplete accounts, but not deleted ones", async () => {
    const banned = await createUser({ banned: true });
    await expect(exportOf(banned.id)).resolves.toMatchObject({ konto: { gesperrtAm: NOW } });
    const legacy = await createUser({ legacy: true });
    await expect(exportOf(legacy.id)).resolves.toMatchObject({
      konto: { vorname: null, eMailBestätigt: false },
      anmeldung: { passwortGespeichert: false },
      team: null,
    });

    const deleted = await createUser();
    await createSession(deleted.id);
    await deleteAccount({ userId: deleted.id, uploadDir, now: NOW });
    await expect(exportOf(deleted.id)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(
      exportAccountData({ userId: "", now: NOW, privacyPolicyUrl: PRIVACY }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("shows the role as the team page names it", async () => {
    const { host } = await bookScrim();
    const member = host.members[0]!;
    await prisma.teamMember.update({
      where: { userId: member.id },
      data: { role: MemberRole.COACH },
    });
    expect((await exportOf(member.id)).team).toMatchObject({ rolle: "Coach", captain: false });
  });
});
