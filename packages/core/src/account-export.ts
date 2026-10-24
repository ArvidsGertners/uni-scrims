// Data export per button (SPEC N-5, ARCHITECTURE §5.10): everything stored about an account, for
// the person itself (Art. 15 GDPR). Read-only. Credentials and other people's data stay out: every
// query selects its columns, so a token or another user's name cannot slip in through a relation.
import { NotifType, Prisma, VerifStatus, prisma } from "@uni-scrims/db";
import { CREDENTIAL_PROVIDER } from "./account.ts";
import {
  FEEDBACK_OUTCOME_LABELS,
  LOGO_BACKGROUND_LABELS,
  MEMBER_ROLE_LABELS,
  NOTIF_STATUS_LABELS,
  NOTIFICATION_TYPE_LABELS,
  REQUEST_STATUS_LABELS,
  SCRIM_FORMAT_LABELS,
  SCRIM_STATUS_LABELS,
  STAFF_ROLE_LABELS,
  VERIF_STATUS_LABELS,
} from "./labels.ts";
import { parseNotificationPayload } from "./notifications.ts";
import { isCaptainOf, requireAccountUser } from "./permissions.ts";
import { RANK_LABELS } from "./ranks.ts";
import { DISCORD_PROVIDER } from "./users.ts";
import { uploadExists } from "./verification.ts";

function notice(now: Date, privacyPolicyUrl: string): string {
  return [
    `Das sind alle Daten, die Uni Scrims zu deinem Konto speichert (Auskunft nach Art. 15 DSGVO), Stand ${now.toISOString()}.`,
    `Zwecke, Empfänger, Speicherdauer und deine Rechte stehen in der Datenschutzerklärung: ${privacyPolicyUrl}.`,
    "Nicht in dieser Datei: Zugangsdaten (Passwort, Schlüssel und Backup-Codes der Zwei-Faktor-Anmeldung, die Tokens von Sitzungen und Mail-Links; dass es sie gibt, steht unter „konto“, „anmeldung“ und „sitzungen“), die Datei einer offenen Prüfung (nur ihre Angaben), Daten anderer Personen, Nachrichten an dein Team (sie hängen am Team, nicht an dir), Server-Logs und Backups (beschrieben in der Datenschutzerklärung).",
    "Zeitpunkte stehen in UTC (ISO 8601).",
  ].join(" ");
}

/**
 * What a stored notification said, in words; the payload holds only display data (§6.1). Only
 * VERIFICATION_RESULT goes to a person. A payload that does not match its type stays as stored,
 * so nothing goes missing.
 */
function notificationContent(type: NotifType, payload: Prisma.JsonValue) {
  if (type === NotifType.VERIFICATION_RESULT) {
    const parsed = parseNotificationPayload(type, payload);
    if (parsed) {
      return {
        ergebnis:
          VERIF_STATUS_LABELS[parsed.approved ? VerifStatus.APPROVED : VerifStatus.REJECTED],
        ablehnungsgrund: parsed.rejectReason,
      };
    }
  }
  return payload;
}

/** Better Auth's rows in `verification` that carry the user ID: open reset links, a pending login. */
function openLinkKind(identifier: string): string {
  return identifier.startsWith("reset-password:")
    ? "Link zum Zurücksetzen des Passworts"
    : "Laufende Anmeldung (Code-Schritt)";
}

/**
 * The export for the account page's download (§5.10): banned and incomplete accounts included,
 * deleted ones not. One snapshot, so all sections show the same state.
 */
export async function exportAccountData(input: {
  userId: string;
  now: Date;
  /** Where the privacy policy is, for the notice at the top. */
  privacyPolicyUrl: string;
  /** To tell whether the file of a review is still there (gone after a restore, §8). */
  uploadDir: string;
}) {
  return prisma.$transaction(
    async (tx) => {
      const user = await requireAccountUser(input.userId, tx);
      const avatar = await tx.userAvatar.findUnique({
        where: { userId: user.id },
        select: { data: true },
      });
      const university = user.universityId
        ? await tx.university.findUnique({
            where: { id: user.universityId },
            select: { name: true },
          })
        : null;
      // Never the tokens or the password hash.
      const logins = await tx.account.findMany({
        where: { userId: user.id },
        select: { providerId: true, accountId: true, createdAt: true, updatedAt: true },
      });
      const discord = logins.find((login) => login.providerId === DISCORD_PROVIDER);
      const credential = logins.find((login) => login.providerId === CREDENTIAL_PROVIDER);
      // Never the secret or the backup codes.
      const twoFactor = await tx.twoFactor.findFirst({
        where: { userId: user.id },
        select: { failedVerificationCount: true, lockedUntil: true },
      });
      // Only kind and expiry; the identifier holds the token.
      const openLinks = await tx.verification.findMany({
        where: { value: user.id },
        orderBy: { createdAt: "asc" },
        select: { identifier: true, createdAt: true, expiresAt: true },
      });
      const sessions = await tx.session.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          updatedAt: true,
          expiresAt: true,
          ipAddress: true,
          userAgent: true,
        },
      });
      const reviews = await tx.verificationRequest.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          status: true,
          decidedAt: true,
          // Only whether a person decided, never who.
          decidedById: true,
          rejectReason: true,
          mimeType: true,
          sizeBytes: true,
          university: { select: { name: true } },
          universityOther: true,
          filePath: true,
        },
      });
      // As findOwnTeam: a membership of a dissolved team does not count (§4).
      const membership = await tx.teamMember.findUnique({
        where: { userId: user.id },
        select: {
          role: true,
          joinedAt: true,
          team: {
            select: {
              name: true,
              tag: true,
              rank: true,
              bannedAt: true,
              captainId: true,
              dissolvedAt: true,
              logoUpdatedAt: true,
              logos: { select: { background: true }, orderBy: { background: "asc" } },
            },
          },
        },
      });
      const team = membership && !membership.team.dissolvedAt ? membership.team : null;
      const dissolvedTeams = await tx.team.findMany({
        where: { captainId: user.id, dissolvedAt: { not: null } },
        orderBy: { createdAt: "asc" },
        select: { name: true, tag: true, createdAt: true, dissolvedAt: true },
      });
      const requests = await tx.scrimRequest.findMany({
        where: { createdById: user.id },
        orderBy: { createdAt: "asc" },
        select: {
          team: { select: { name: true } },
          createdAt: true,
          startsAt: true,
          format: true,
          rankMin: true,
          rankMax: true,
          maps: true,
          note: true,
          status: true,
        },
      });
      const feedback = await tx.scrimFeedback.findMany({
        where: { submittedById: user.id },
        orderBy: { createdAt: "asc" },
        select: {
          teamId: true,
          outcome: true,
          rating: true,
          createdAt: true,
          scrim: { select: { startsAt: true, hostTeamId: true, guestTeamId: true } },
        },
      });
      // The team names in a query of their own: Prisma loads sibling relations concurrently, which
      // the one connection of a transaction does not allow (pg warns).
      const feedbackTeams =
        feedback.length === 0
          ? []
          : await tx.team.findMany({
              where: {
                id: { in: feedback.flatMap(({ scrim }) => [scrim.hostTeamId, scrim.guestTeamId]) },
              },
              select: { id: true, name: true },
            });
      const teamNames = new Map(feedbackTeams.map(({ id, name }) => [id, name]));
      const teamName = (id: string) => teamNames.get(id) ?? null;
      const notifications = await tx.notification.findMany({
        where: { targetUserId: user.id },
        orderBy: { createdAt: "asc" },
        select: {
          type: true,
          payload: true,
          status: true,
          scheduledFor: true,
          attempts: true,
          lastError: true,
          createdAt: true,
          sentAt: true,
        },
      });
      // Own decisions as staff: date and result only, nothing about the person or the teams.
      const decidedReviews = await tx.verificationRequest.findMany({
        where: { decidedById: user.id },
        orderBy: { decidedAt: "asc" },
        select: { decidedAt: true, status: true },
      });
      const resolvedDisputes = await tx.scrim.findMany({
        where: { resolvedById: user.id },
        orderBy: { resolvedAt: "asc" },
        select: { resolvedAt: true, status: true },
      });
      const filesStored = await Promise.all(
        reviews.map((review) => uploadExists(input.uploadDir, review.filePath)),
      );

      return {
        hinweis: notice(input.now, input.privacyPolicyUrl),
        erstelltAm: input.now,
        konto: {
          id: user.id,
          // Without a Discord link the name is the placeholder "Neues Konto" (§5.8).
          discordName: discord ? user.name : null,
          avatar: user.image,
          // The copy itself is personal data (SPEC N-8), small enough to carry inline.
          profilbild: avatar
            ? `data:image/webp;base64,${Buffer.from(avatar.data).toString("base64")}`
            : null,
          profilbildKopiertAm: user.avatarUpdatedAt,
          // An account from before Phase 7 has only the internal placeholder, as on the account page.
          eMail: user.firstName ? user.email : null,
          eMailBestätigt: user.emailVerified,
          vorname: user.firstName,
          nachname: user.lastName,
          hochschule: university?.name ?? null,
          hochschuleFreitext: user.universityOther,
          angelegtAm: user.createdAt,
          geändertAm: user.updatedAt,
          verifiziertAm: user.verifiedAt,
          gesperrtAm: user.bannedAt,
          hubBeitrittGescheitertAm: user.hubJoinFailedAt,
          dmGescheitertAm: user.dmFailedAt,
          rolle: user.staffRole ? STAFF_ROLE_LABELS[user.staffRole] : null,
          zweiFaktorEingerichtet: user.twoFactorEnabled,
          zweiFaktorFehlversuche: twoFactor?.failedVerificationCount ?? null,
          zweiFaktorGesperrtBis: twoFactor?.lockedUntil ?? null,
        },
        anmeldung: {
          discordId: discord?.accountId ?? null,
          discordVerknüpftAm: discord?.createdAt ?? null,
          passwortGespeichert: credential !== undefined,
          passwortGeändertAm: credential?.updatedAt ?? null,
          offeneLinks: openLinks.map((link) => ({
            art: openLinkKind(link.identifier),
            angelegtAm: link.createdAt,
            läuftAbAm: link.expiresAt,
          })),
        },
        sitzungen: sessions.map((session) => ({
          angelegtAm: session.createdAt,
          // Better Auth writes the row only when it extends the session, not on every use.
          zuletztVerlängertAm: session.updatedAt,
          läuftAbAm: session.expiresAt,
          ipAdresse: session.ipAddress,
          browser: session.userAgent,
        })),
        prüfungen: reviews.map((review, index) => ({
          hochgeladenAm: review.createdAt,
          status: VERIF_STATUS_LABELS[review.status],
          entschiedenAm: review.decidedAt,
          entschieden:
            review.status === VerifStatus.PENDING
              ? null
              : review.decidedById
                ? "von Hand"
                : "automatisch",
          ablehnungsgrund: review.rejectReason,
          dateityp: review.mimeType,
          dateigrößeBytes: review.sizeBytes,
          hochschule: review.university?.name ?? null,
          hochschuleFreitext: review.universityOther,
          dateiGespeichert: filesStored[index],
        })),
        team:
          membership && team
            ? {
                name: team.name,
                kürzel: team.tag,
                rang: RANK_LABELS[team.rank],
                gesperrtAm: team.bannedAt,
                // The image itself is team data without personal reference (SPEC N-6).
                // The last change to either logo (SPEC N-6, N-7).
                logosGeändertAm: team.logoUpdatedAt,
                logos: team.logos.map((logo) => LOGO_BACKGROUND_LABELS[logo.background]),
                rolle: MEMBER_ROLE_LABELS[membership.role],
                captain: isCaptainOf(user, team),
                beigetretenAm: membership.joinedAt,
              }
            : null,
        aufgelösteTeams: dissolvedTeams.map((team) => ({
          name: team.name,
          kürzel: team.tag,
          gegründetAm: team.createdAt,
          aufgelöstAm: team.dissolvedAt,
        })),
        anfragen: requests.map((request) => ({
          team: request.team.name,
          erstelltAm: request.createdAt,
          startAm: request.startsAt,
          format: SCRIM_FORMAT_LABELS[request.format],
          rangVon: RANK_LABELS[request.rankMin],
          rangBis: RANK_LABELS[request.rankMax],
          maps: request.maps,
          notiz: request.note,
          status: REQUEST_STATUS_LABELS[request.status],
        })),
        feedback: feedback.map((entry) => ({
          team: teamName(entry.teamId),
          gegner: teamName(
            entry.scrim.hostTeamId === entry.teamId
              ? entry.scrim.guestTeamId
              : entry.scrim.hostTeamId,
          ),
          scrimStartAm: entry.scrim.startsAt,
          antwort: FEEDBACK_OUTCOME_LABELS[entry.outcome],
          sterne: entry.rating,
          abgegebenAm: entry.createdAt,
        })),
        nachrichten: notifications.map((notification) => ({
          art: NOTIFICATION_TYPE_LABELS[notification.type],
          inhalt: notificationContent(notification.type, notification.payload),
          status: NOTIF_STATUS_LABELS[notification.status],
          erstelltAm: notification.createdAt,
          geplantAm: notification.scheduledFor,
          zustellversuche: notification.attempts,
          letzterFehler: notification.lastError,
          gesendetAm: notification.sentAt,
        })),
        verwaltung: {
          prüfungen: decidedReviews.map((review) => ({
            entschiedenAm: review.decidedAt,
            ergebnis: VERIF_STATUS_LABELS[review.status],
          })),
          streitfälle: resolvedDisputes.map((scrim) => ({
            entschiedenAm: scrim.resolvedAt,
            ergebnis: SCRIM_STATUS_LABELS[scrim.status],
          })),
        },
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

export type AccountExport = Awaited<ReturnType<typeof exportAccountData>>;
