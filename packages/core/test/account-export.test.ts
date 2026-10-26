import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  FeedbackOutcome,
  MemberRole,
  Prisma,
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
  exportAccountData({ userId, now: NOW, privacyPolicyUrl: PRIVACY, uploadDir });
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
  const status = data.status ?? VerifStatus.PENDING;
  return prisma.verificationRequest.create({
    data: {
      userId,
      pendingUserId: status === VerifStatus.PENDING ? userId : null,
      mimeType: "application/pdf",
      sizeBytes: 1234,
      createdAt: NOW,
      decidedAt: status === VerifStatus.PENDING ? null : NOW,
      ...data,
      status,
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
  await prisma.team.update({
    where: { id: host.team.id },
    data: {
      logoUpdatedAt: NOW,
      logos: { create: { data: new Uint8Array([1, 2, 3]) } },
      websiteUrl: "https://eure-seite.de/",
      xUrl: "https://x.com/team",
      linksUpdatedAt: NOW,
      listed: false,
    },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: {
      avatarUpdatedAt: NOW,
      avatar: { create: { data: new Uint8Array([4, 5, 6]) } },
      theme: "DARK",
      locale: "EN",
      // Above the others' Gold: the team rank stays Gold (4 × Gold + Diamond).
      rank: "DIAMOND",
      notificationPreferences: { create: { type: "SCRIM_BOOKED", email: true } },
    },
  });
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
      failedVerificationCount: 2,
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
  const fileName = `${uid()}.pdf`;
  await writeFile(path.join(uploadDir, fileName), "%PDF");
  await review(user.id, {
    status: VerifStatus.PENDING,
    filePath: fileName,
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
      attempts: 2,
      lastError: "Discord 50007",
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
      profilbild: `data:image/webp;base64,${Buffer.from([4, 5, 6]).toString("base64")}`,
      profilbildKopiertAm: NOW,
      eMail: user.email,
      eMailBestätigt: true,
      vorname: user.firstName,
      nachname: user.lastName,
      hochschule: university.name,
      verifiziertAm: NOW,
      gesperrtAm: null,
      rolle: "Admin",
      zweiFaktorEingerichtet: true,
      zweiFaktorFehlversuche: 2,
      zweiFaktorGesperrtBis: null,
      design: "Dunkel",
      sprache: "Englisch",
      rang: "Diamond",
    });
    expect(data.anmeldung).toMatchObject({
      discordId: user.discordId,
      passwortGespeichert: true,
      offeneLinks: [
        {
          art: "Link zum Zurücksetzen des Passworts",
          angelegtAm: expect.any(Date),
          läuftAbAm: new Date(NOW.getTime() + HOUR),
        },
      ],
    });
    expect(data.sitzungen).toEqual([
      expect.objectContaining({
        ipAdresse: "203.0.113.7",
        browser: "Firefox Test",
        zuletztVerlängertAm: expect.any(Date),
      }),
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
    expect(data.teams).toEqual([
      {
        name: host.team.name,
        kürzel: host.team.tag,
        rang: "Gold",
        gesperrtAm: null,
        logosGeändertAm: NOW,
        logos: ["Logo für dunklen Hintergrund"],
        externeLinks: {
          discord: null,
          website: "https://eure-seite.de/",
          x: "https://x.com/team",
          instagram: null,
          twitch: null,
          youtube: null,
          tiktok: null,
        },
        linksGeändertAm: NOW,
        inTeamsListe: false,
        nurVollstaendigVerifizierteBewerber: false,
        rolle: "Spieler",
        captain: true,
        beigetretenAm: NOW,
      },
    ]);
    expect(data.aktivesTeam).toBe(host.team.name);
    expect(data.teamLimit).toBe(5);
    expect(data.teamAnträge).toEqual([]);
    expect(data.aufgelösteTeams).toEqual([
      expect.objectContaining({ name: "Altes Team", kürzel: "ALT" }),
    ]);
    expect(data.anfragen).toEqual([
      expect.objectContaining({
        team: host.team.name,
        format: "1 Map",
        rangVon: "Silver",
        rangBis: "Platinum",
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
        zustellversuche: 2,
        letzterFehler: "Discord 50007",
      }),
    ]);
    expect(data.benachrichtigungen).toEqual([
      { art: "Scrim gebucht", discord: "Standard", eMail: "an" },
    ]);
    expect(data.verwaltung).toEqual({ prüfungen: [], streitfälle: [], teamAnträge: [] });
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
      teamAnträge: [],
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
    // Placeholders are not personal data: the internal address of an old account, and the name of
    // an account without Discord.
    const legacy = await createUser({ legacy: true });
    await expect(exportOf(legacy.id)).resolves.toMatchObject({
      konto: { vorname: null, eMail: null, eMailBestätigt: false },
      anmeldung: { passwortGespeichert: false },
      teams: [],
    });
    const withoutDiscord = await createUser();
    await prisma.account.deleteMany({ where: { userId: withoutDiscord.id } });
    await prisma.user.update({
      where: { id: withoutDiscord.id },
      data: { name: "Neues Konto", email: `${uid()}@example.org` },
    });
    await expect(exportOf(withoutDiscord.id)).resolves.toMatchObject({
      konto: { discordName: null, eMail: expect.stringMatching(/@example\.org$/) },
      anmeldung: { discordId: null },
    });

    const deleted = await createUser();
    await createSession(deleted.id);
    await deleteAccount({ userId: deleted.id, uploadDir, now: NOW });
    await expect(exportOf(deleted.id)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(
      exportAccountData({ userId: "", now: NOW, privacyPolicyUrl: PRIVACY, uploadDir }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("tells whether a review's file is really still there", async () => {
    // After a restore the row may still name a file the upload volume no longer has (§8).
    const user = await createUser();
    await review(user.id, { filePath: `${uid()}.pdf` });
    expect((await exportOf(user.id)).prüfungen).toEqual([
      expect.objectContaining({ status: "In Prüfung", dateiGespeichert: false }),
    ]);
  });

  it("shows no team for a membership left in a dissolved team, as findOwnTeams", async () => {
    const { team, members } = await bookScrim().then(({ host }) => host);
    await prisma.team.update({ where: { id: team.id }, data: { dissolvedAt: NOW } });
    expect(await exportOf(members[0]!.id)).toMatchObject({ teams: [], aktivesTeam: null });
  });

  it("shows the role as the team page names it", async () => {
    const { host } = await bookScrim();
    const member = host.members[0]!;
    await prisma.teamMember.updateMany({
      where: { userId: member.id },
      data: { role: MemberRole.COACH },
    });
    expect((await exportOf(member.id)).teams).toEqual([
      expect.objectContaining({ rolle: "Coach", captain: false }),
    ]);
  });
});

// Every column of every table, sorted into what the export shows and what it leaves out on purpose
// (§5.10). A new table or column fails the test below until it is sorted in here; otherwise the
// export, which promises all stored data, would silently miss it.
const SHOWN = "in der Auskunft";
const SELF = "die Person selbst";
const KEY = "technischer Schlüssel";
const CREDENTIAL = "Zugangsdaten, nur dass es sie gibt";
const TEAM = "Teamdaten, keine Daten der Person";
const COLUMNS: Record<Prisma.ModelName, Record<string, string>> = {
  User: {
    id: SHOWN,
    name: SHOWN,
    email: SHOWN,
    emailVerified: SHOWN,
    image: SHOWN,
    createdAt: SHOWN,
    updatedAt: SHOWN,
    universityId: SHOWN,
    universityOther: SHOWN,
    verifiedAt: SHOWN,
    bannedAt: SHOWN,
    hubJoinFailedAt: SHOWN,
    dmFailedAt: SHOWN,
    deletedAt: "nur bei gelöschten Konten gesetzt, und die bekommen keine Auskunft",
    firstName: SHOWN,
    lastName: SHOWN,
    staffRole: SHOWN,
    twoFactorEnabled: SHOWN,
    avatarUpdatedAt: SHOWN,
    theme: SHOWN,
    rank: SHOWN,
    locale: SHOWN,
    activeTeamId: SHOWN,
    teamLimit: SHOWN,
  },
  UserAvatar: { userId: KEY, data: SHOWN },
  Session: {
    id: KEY,
    expiresAt: SHOWN,
    token: CREDENTIAL,
    createdAt: SHOWN,
    updatedAt: SHOWN,
    ipAddress: SHOWN,
    userAgent: SHOWN,
    userId: SELF,
  },
  Account: {
    id: KEY,
    accountId: SHOWN,
    providerId: SHOWN,
    userId: SELF,
    accessToken: CREDENTIAL,
    refreshToken: CREDENTIAL,
    idToken: CREDENTIAL,
    accessTokenExpiresAt: CREDENTIAL,
    refreshTokenExpiresAt: CREDENTIAL,
    scope: CREDENTIAL,
    password: CREDENTIAL,
    createdAt: SHOWN,
    updatedAt: SHOWN,
  },
  TwoFactor: {
    id: KEY,
    secret: CREDENTIAL,
    backupCodes: CREDENTIAL,
    userId: SELF,
    verified: "steckt in zweiFaktorEingerichtet",
    failedVerificationCount: SHOWN,
    lockedUntil: SHOWN,
  },
  Verification: {
    id: KEY,
    identifier: "enthält den Token; nur die Art des Links",
    value: SELF,
    expiresAt: SHOWN,
    createdAt: SHOWN,
    updatedAt: "Better Auth ändert die Zeile nicht",
  },
  University: { id: KEY, name: SHOWN, city: "Stammdaten", slug: "Stammdaten" },
  VerificationRequest: {
    id: KEY,
    userId: SELF,
    pendingUserId: "steckt im Status",
    universityId: SHOWN,
    universityOther: SHOWN,
    filePath: "nur ob die Datei noch da ist",
    mimeType: SHOWN,
    sizeBytes: SHOWN,
    status: SHOWN,
    rejectReason: SHOWN,
    createdAt: SHOWN,
    decidedAt: SHOWN,
    decidedById: "nur ob von Hand; wer, wäre eine andere Person",
  },
  TeamLimitRequest: {
    id: KEY,
    userId: SELF,
    pendingUserId: "steckt im Status",
    reason: SHOWN,
    status: SHOWN,
    newLimit: SHOWN,
    createdAt: SHOWN,
    decidedAt: SHOWN,
    decidedById: "bei der Person nur ob von Hand; bei Admins ihre Entscheidungen in verwaltung",
  },
  Team: {
    id: KEY,
    name: SHOWN,
    nameNormalized: "aus dem Namen abgeleitet",
    tag: SHOWN,
    game: TEAM,
    captainId: SHOWN,
    inviteCode: TEAM,
    discordGuildId: TEAM,
    discordChannelId: TEAM,
    bannedAt: SHOWN,
    dissolvedAt: SHOWN,
    createdAt: SHOWN,
    logoUpdatedAt: SHOWN,
    discordUrl: SHOWN,
    websiteUrl: SHOWN,
    xUrl: SHOWN,
    instagramUrl: SHOWN,
    twitchUrl: SHOWN,
    youtubeUrl: SHOWN,
    tiktokUrl: SHOWN,
    linksUpdatedAt: SHOWN,
    listed: SHOWN,
    verifiedApplicantsOnly: SHOWN,
  },
  TeamLogo: { teamId: KEY, background: SHOWN, data: TEAM },
  TeamMember: { teamId: SHOWN, userId: SELF, role: SHOWN, joinedAt: SHOWN },
  ScrimRequest: {
    id: KEY,
    teamId: SHOWN,
    createdById: SELF,
    game: TEAM,
    startsAt: SHOWN,
    format: SHOWN,
    rankMin: SHOWN,
    rankMax: SHOWN,
    maps: SHOWN,
    note: SHOWN,
    status: SHOWN,
    createdAt: SHOWN,
  },
  Application: {
    id: KEY,
    requestId: TEAM,
    teamId: TEAM,
    message: "Teamdaten ohne Verfasser",
    status: TEAM,
    createdAt: TEAM,
    decidedAt: TEAM,
  },
  Scrim: {
    id: KEY,
    requestId: TEAM,
    hostTeamId: SHOWN,
    guestTeamId: SHOWN,
    startsAt: SHOWN,
    format: TEAM,
    maps: TEAM,
    feedbackOpensAt: TEAM,
    feedbackDeadline: TEAM,
    status: SHOWN,
    cancelledByTeamId: TEAM,
    cancelledAt: TEAM,
    lateCancel: TEAM,
    noShowTeamId: TEAM,
    resolvedById: SELF,
    resolvedAt: SHOWN,
    createdAt: TEAM,
  },
  ScrimFeedback: {
    id: KEY,
    scrimId: SHOWN,
    teamId: SHOWN,
    submittedById: SELF,
    outcome: SHOWN,
    rating: SHOWN,
    createdAt: SHOWN,
  },
  Notification: {
    id: KEY,
    type: SHOWN,
    channel: SHOWN,
    targetUserId: SELF,
    targetTeamId: SHOWN,
    scrimId: "Verweis auf Teamdaten",
    requestId: "Verweis auf Teamdaten",
    payload: SHOWN,
    scheduledFor: SHOWN,
    status: SHOWN,
    attempts: SHOWN,
    lastError: SHOWN,
    dedupeKey: KEY,
    createdAt: SHOWN,
    sentAt: SHOWN,
  },
  NotificationPreference: { userId: SELF, type: SHOWN, discord: SHOWN, email: SHOWN },
  SystemStatus: { id: "Bot-Heartbeat, keine Personendaten", heartbeatAt: "Bot-Heartbeat" },
};

describe("exportAccountData coverage", () => {
  it("has decided on every table and column of the schema", () => {
    const enums = Prisma as unknown as Record<string, Record<string, string>>;
    expect(Object.keys(COLUMNS).sort()).toEqual(Object.values(Prisma.ModelName).sort());
    for (const [model, columns] of Object.entries(COLUMNS)) {
      expect(Object.keys(columns).sort(), model).toEqual(
        Object.values(enums[`${model}ScalarFieldEnum`]!).sort(),
      );
    }
  });
});
