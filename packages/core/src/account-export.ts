// Data export per button (SPEC N-5, ARCHITECTURE §5.10): everything stored about an account, for
// the person itself (Art. 15 GDPR). Read-only. Credentials and other people's data stay out: every
// query selects its columns, so a token or another user's name cannot slip in through a relation.
import { NotifType, Prisma, VerifStatus, prisma } from "@uni-scrims/db";
import { CREDENTIAL_PROVIDER } from "./account.ts";
import {
  FEEDBACK_OUTCOME_LABELS,
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
import { requireAccountUser } from "./permissions.ts";
import { RANK_LABELS } from "./ranks.ts";
import { DISCORD_PROVIDER } from "./users.ts";

function notice(now: Date, privacyPolicyUrl: string): string {
  return [
    `Das sind alle Daten, die Uni Scrims zu deinem Konto speichert (Auskunft nach Art. 15 DSGVO), Stand ${now.toISOString()}.`,
    `Zwecke, Empfänger, Speicherdauer und deine Rechte stehen in der Datenschutzerklärung: ${privacyPolicyUrl}.`,
    "Nicht in dieser Datei: Zugangsdaten (Passwort, Schlüssel und Backup-Codes der Zwei-Faktor-Anmeldung, die Tokens von Sitzungen und Mail-Links; dass es sie gibt, steht unter „anmeldung“ und „konto“), die Datei einer offenen Prüfung (nur ihre Angaben), Daten anderer Personen, Nachrichten an dein Team (sie hängen am Team, nicht an dir), Server-Logs und Backups (beschrieben in der Datenschutzerklärung).",
    "Zeitpunkte stehen in UTC (ISO 8601).",
  ].join(" ");
}

/** What a stored notification said, in words; the payload holds only display data (§6.1). */
function notificationContent(type: NotifType, payload: Prisma.JsonValue) {
  if (type === NotifType.VERIFICATION_RESULT) {
    const parsed = parseNotificationPayload(type, payload);
    if (parsed) {
      return {
        ergebnis: parsed.approved ? "Freigegeben" : "Abgelehnt",
        ablehnungsgrund: parsed.rejectReason,
      };
    }
  }
  return payload;
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
}) {
  return prisma.$transaction(
    async (tx) => {
      const user = await requireAccountUser(input.userId, tx);
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
      const membership = await tx.teamMember.findUnique({
        where: { userId: user.id },
        select: {
          role: true,
          joinedAt: true,
          team: {
            select: { name: true, tag: true, rank: true, bannedAt: true, captainId: true },
          },
        },
      });
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
      const feedbackTeams = await tx.team.findMany({
        where: {
          id: { in: feedback.flatMap(({ scrim }) => [scrim.hostTeamId, scrim.guestTeamId]) },
        },
        select: { id: true, name: true },
      });
      const teamName = (id: string) => feedbackTeams.find((team) => team.id === id)?.name ?? null;
      const notifications = await tx.notification.findMany({
        where: { targetUserId: user.id },
        orderBy: { createdAt: "asc" },
        select: { type: true, payload: true, status: true, createdAt: true, sentAt: true },
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

      return {
        hinweis: notice(input.now, input.privacyPolicyUrl),
        erstelltAm: input.now,
        konto: {
          id: user.id,
          discordName: user.name,
          avatar: user.image,
          eMail: user.email,
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
        },
        anmeldung: {
          discordId: discord?.accountId ?? null,
          discordVerknüpftAm: discord?.createdAt ?? null,
          passwortGespeichert: credential !== undefined,
          passwortGeändertAm: credential?.updatedAt ?? null,
        },
        sitzungen: sessions.map((session) => ({
          angelegtAm: session.createdAt,
          zuletztGenutztAm: session.updatedAt,
          läuftAbAm: session.expiresAt,
          ipAdresse: session.ipAddress,
          browser: session.userAgent,
        })),
        prüfungen: reviews.map((review) => ({
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
          dateiGespeichert: review.filePath !== null,
        })),
        team: membership
          ? {
              name: membership.team.name,
              kürzel: membership.team.tag,
              rang: RANK_LABELS[membership.team.rank],
              gesperrtAm: membership.team.bannedAt,
              rolle: MEMBER_ROLE_LABELS[membership.role],
              captain: membership.team.captainId === user.id,
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
