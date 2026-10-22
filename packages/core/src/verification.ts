// Verification via certificate of enrolment (SPEC P0-2, ARCHITECTURE §5.2).
import { readdir, stat } from "node:fs/promises";
import { NotifChannel, NotifType, Prisma, VerifStatus, prisma } from "@uni-scrims/db";
import { TIMING } from "../config/timing.ts";
import type { Db } from "./db.ts";
import { DomainError } from "./errors.ts";
import { queueNotifications } from "./notifications.ts";
import { lockUser } from "./locks.ts";
import { requireAdmin, requireUser } from "./permissions.ts";
import { deleteUpload, detectUploadType, storeUpload, uploadFilePath } from "./uploads.ts";

export const AUTO_REJECT_REASON = "Prüfung nicht rechtzeitig erfolgt";
/** Janitor: a pending request whose file is gone (restored database backup). */
export const MISSING_FILE_REASON = "Datei nicht mehr vorhanden, bitte erneut hochladen";
/** banUser closes a pending request with this reason and without a message. */
export const BAN_REJECT_REASON = "Konto gesperrt";
/** Files in the upload directory without a database row are deleted after this age. */
export const ORPHAN_FILE_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_UNIVERSITY_OTHER_LENGTH = 200;
export const MAX_REJECT_REASON_LENGTH = 500;

export async function listUniversities(db: Db = prisma) {
  return db.university.findMany({
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, city: true },
  });
}

/** Status for the verify page: verified, or the latest request. */
export async function getVerificationStatus(userId: string, db: Db = prisma) {
  const user = await requireUser(userId, db);
  const latest = await db.verificationRequest.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { status: true, rejectReason: true, createdAt: true, decidedAt: true },
  });
  return { verifiedAt: user.verifiedAt, latest };
}

export type SubmitVerificationInput = {
  userId: string;
  /** Exactly one of universityId and universityOther. */
  universityId?: string | null;
  universityOther?: string | null;
  consent: boolean;
  file: Uint8Array;
  uploadDir: string;
  now: Date;
};

export async function submitVerification(input: SubmitVerificationInput) {
  const user = await requireUser(input.userId);
  if (!input.consent) {
    throw new DomainError("INVALID", "Bitte bestätige den Datenschutzhinweis.");
  }
  if (user.verifiedAt) {
    throw new DomainError("CONFLICT", "Du bist bereits verifiziert.");
  }
  const universityId = input.universityId || null;
  const universityOther = input.universityOther?.trim() || null;
  if ((universityId === null) === (universityOther === null)) {
    throw new DomainError(
      "INVALID",
      "Bitte wähle deine Hochschule aus oder gib sie unter „Andere“ an.",
    );
  }
  if (universityOther && universityOther.length > MAX_UNIVERSITY_OTHER_LENGTH) {
    throw new DomainError("INVALID", "Der Name der Hochschule ist zu lang.");
  }
  if (universityId && !(await prisma.university.findUnique({ where: { id: universityId } }))) {
    throw new DomainError("INVALID", "Unbekannte Hochschule.");
  }
  if (await prisma.verificationRequest.findUnique({ where: { pendingUserId: user.id } })) {
    throw pendingConflict();
  }

  const type = await detectUploadType(input.file);
  const fileName = await storeUpload(input.uploadDir, input.file, type.ext);
  try {
    return await prisma.$transaction(async (tx) => {
      // User before VerificationRequest (§4), as in deleteAccount, banUser and decideVerification:
      // a deletion or ban that commits meanwhile is seen here, a later one finds this request.
      await lockUser(tx, user.id);
      const current = await requireUser(user.id, tx);
      if (current.verifiedAt) {
        throw new DomainError("CONFLICT", "Du bist bereits verifiziert.");
      }
      if (await tx.verificationRequest.findUnique({ where: { pendingUserId: user.id } })) {
        throw pendingConflict();
      }
      return tx.verificationRequest.create({
        data: {
          userId: user.id,
          pendingUserId: user.id,
          universityId,
          universityOther,
          filePath: fileName,
          mimeType: type.mimeType,
          sizeBytes: input.file.byteLength,
          status: VerifStatus.PENDING,
          createdAt: input.now,
        },
      });
    });
  } catch (error) {
    await deleteUpload(input.uploadDir, fileName);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw pendingConflict();
    }
    throw error;
  }
}

function pendingConflict(): DomainError {
  return new DomainError("CONFLICT", "Du hast bereits eine offene Prüfung.");
}

export type DecideVerificationInput = {
  requestId: string;
  adminId: string;
  decision: "APPROVED" | "REJECTED";
  rejectReason?: string | null;
  /** For "Andere": optionally assign a seed university on approval. */
  universityId?: string | null;
  uploadDir: string;
  now: Date;
};

export async function decideVerification(input: DecideVerificationInput): Promise<void> {
  await requireAdmin(input.adminId);
  const rejectReason = input.rejectReason?.trim() || null;
  if (input.decision === "REJECTED" && !rejectReason) {
    throw new DomainError("INVALID", "Bitte gib einen Grund für die Ablehnung an.");
  }
  if (rejectReason && rejectReason.length > MAX_REJECT_REASON_LENGTH) {
    throw new DomainError("INVALID", "Der Grund ist zu lang.");
  }
  if (
    input.universityId &&
    !(await prisma.university.findUnique({ where: { id: input.universityId } }))
  ) {
    throw new DomainError("INVALID", "Unbekannte Hochschule.");
  }

  const request = await prisma.$transaction(async (tx) => {
    const request = await tx.verificationRequest.findUnique({ where: { id: input.requestId } });
    if (!request) {
      throw new DomainError("NOT_FOUND", "Prüfung nicht gefunden.");
    }
    // User before VerificationRequest (§4), as in deleteAccount: the other order deadlocked with it.
    await lockUser(tx, request.userId);
    const approved = input.decision === "APPROVED";
    const universityId = request.universityId ?? (approved ? input.universityId || null : null);
    const updated = await tx.verificationRequest.updateMany({
      where: { id: request.id, status: VerifStatus.PENDING },
      data: {
        status: approved ? VerifStatus.APPROVED : VerifStatus.REJECTED,
        rejectReason: approved ? null : rejectReason,
        universityId,
        decidedAt: input.now,
        decidedById: input.adminId,
        pendingUserId: null,
      },
    });
    if (updated.count === 0) {
      // Decided meanwhile, or deleted with the account.
      throw (await tx.verificationRequest.findUnique({ where: { id: request.id } }))
        ? new DomainError("CONFLICT", "Diese Prüfung ist bereits entschieden.")
        : new DomainError("NOT_FOUND", "Prüfung nicht gefunden.");
    }
    if (approved) {
      await tx.user.update({
        where: { id: request.userId },
        data: {
          verifiedAt: input.now,
          universityId,
          universityOther: universityId ? null : request.universityOther,
        },
      });
    }
    await createResultNotification(
      tx,
      request.id,
      request.userId,
      approved,
      rejectReason,
      input.now,
    );
    return request;
  });

  // After the commit: the file is deleted right after the decision (SPEC P0-2). The decision is
  // already saved, so a failure here must not look like a failed decision; janitor step 2 retries.
  try {
    await removeVerificationFile(request.id, request.filePath, input.uploadDir);
  } catch (error) {
    console.error(`Could not delete the upload of verification ${request.id}`, error);
  }
}

async function createResultNotification(
  db: Db,
  requestId: string,
  userId: string,
  approved: boolean,
  rejectReason: string | null,
  now: Date,
): Promise<void> {
  await queueNotifications(db, now, [
    {
      type: NotifType.VERIFICATION_RESULT,
      channel: NotifChannel.USER_DM,
      entityId: requestId,
      targetUserId: userId,
      payload: { approved, rejectReason },
    },
  ]);
}

/**
 * Deletes the file of a decided request and clears filePath. Callers run it after their commit;
 * if it fails, janitor step 2 retries. A request deleted meanwhile (account deletion) is skipped.
 */
export async function removeVerificationFile(
  requestId: string,
  fileName: string | null,
  uploadDir: string,
): Promise<void> {
  if (!fileName) return;
  await deleteUpload(uploadDir, fileName);
  await prisma.verificationRequest.updateMany({
    where: { id: requestId },
    data: { filePath: null },
  });
}

/**
 * Rejects a pending request without the user's doing, in the caller's transaction. The caller holds
 * the user row (§4). Returns false if the request was no longer pending.
 */
async function rejectPending(
  tx: Prisma.TransactionClient,
  request: { id: string; userId: string },
  reason: string,
  now: Date,
): Promise<boolean> {
  const updated = await tx.verificationRequest.updateMany({
    where: { id: request.id, status: VerifStatus.PENDING },
    data: {
      status: VerifStatus.REJECTED,
      rejectReason: reason,
      decidedAt: now,
      decidedById: null,
      pendingUserId: null,
    },
  });
  if (updated.count === 0) return false;
  await createResultNotification(tx, request.id, request.userId, false, reason, now);
  return true;
}

/** Janitor step 1: pending requests older than VERIFICATION_TTL are rejected automatically. */
export async function autoRejectStaleVerifications(
  now: Date,
  uploadDir: string,
  ttlMs: number = TIMING.VERIFICATION_TTL,
): Promise<number> {
  const stale = await prisma.verificationRequest.findMany({
    where: { status: VerifStatus.PENDING, createdAt: { lte: new Date(now.getTime() - ttlMs) } },
    select: { id: true, userId: true, filePath: true },
  });
  let rejected = 0;
  for (const request of stale) {
    const changed = await prisma.$transaction(async (tx) => {
      // User before VerificationRequest (§4), as in decideVerification.
      await lockUser(tx, request.userId);
      return rejectPending(tx, request, AUTO_REJECT_REASON, now);
    });
    if (changed) {
      rejected++;
      try {
        await removeVerificationFile(request.id, request.filePath, uploadDir);
      } catch (error) {
        console.error(`Could not delete the upload of verification ${request.id}`, error);
      }
    }
  }
  return rejected;
}

/**
 * Janitor step 2: pending requests whose file is gone, e.g. after restoring a database backup
 * (uploads are not backed up, ARCHITECTURE §8). They cannot be checked, so the user uploads again.
 */
export async function rejectPendingWithoutFile(now: Date, uploadDir: string): Promise<number> {
  // A missing directory means a wrong UPLOAD_DIR or a missing volume, not lost files: reject nothing.
  if (!(await isDirectory(uploadDir))) {
    console.error(`Upload directory ${uploadDir} is missing; pending verifications are kept`);
    return 0;
  }
  const pending = await prisma.verificationRequest.findMany({
    where: { status: VerifStatus.PENDING },
    select: { id: true, userId: true, filePath: true },
  });
  let rejected = 0;
  for (const request of pending) {
    if (request.filePath && (await uploadExists(uploadDir, request.filePath))) continue;
    const changed = await prisma.$transaction(async (tx) => {
      await lockUser(tx, request.userId);
      return rejectPending(tx, request, MISSING_FILE_REASON, now);
    });
    if (changed) {
      rejected++;
      await prisma.verificationRequest.updateMany({
        where: { id: request.id },
        data: { filePath: null },
      });
    }
  }
  return rejected;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function uploadExists(uploadDir: string, fileName: string): Promise<boolean> {
  try {
    return (await stat(uploadFilePath(uploadDir, fileName))).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** Janitor step 3: decided requests that still reference a file. */
export async function cleanupDecidedFiles(uploadDir: string): Promise<number> {
  const leftovers = await prisma.verificationRequest.findMany({
    where: { status: { not: VerifStatus.PENDING }, filePath: { not: null } },
    select: { id: true, filePath: true },
  });
  for (const request of leftovers) {
    await removeVerificationFile(request.id, request.filePath, uploadDir);
  }
  return leftovers.length;
}

/** Janitor step 4: files without a database row that are older than 24 h. */
export async function cleanupOrphanFiles(uploadDir: string, now: Date): Promise<number> {
  let names: string[];
  try {
    names = await readdir(uploadDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
  const referenced = new Set(
    (
      await prisma.verificationRequest.findMany({
        where: { filePath: { in: names } },
        select: { filePath: true },
      })
    ).map((request) => request.filePath),
  );
  let deleted = 0;
  for (const name of names) {
    if (referenced.has(name)) continue;
    let info: Awaited<ReturnType<typeof stat>>;
    try {
      info = await stat(uploadFilePath(uploadDir, name));
    } catch (error) {
      // Deleted meanwhile, e.g. by a decision between readdir and stat.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (!info.isFile() || now.getTime() - info.mtimeMs < ORPHAN_FILE_AGE_MS) continue;
    await deleteUpload(uploadDir, name);
    deleted++;
  }
  return deleted;
}

/** One janitor run (§5.2), called at startup and then hourly by the web process. */
export async function runUploadJanitor(uploadDir: string, now: Date) {
  return {
    autoRejected: await autoRejectStaleVerifications(now, uploadDir),
    missingFiles: await rejectPendingWithoutFile(now, uploadDir),
    decidedFiles: await cleanupDecidedFiles(uploadDir),
    orphanFiles: await cleanupOrphanFiles(uploadDir, now),
  };
}

/** Admin queue, oldest first (SPEC P0-9). */
export async function listPendingVerifications(adminId: string) {
  await requireAdmin(adminId);
  return prisma.verificationRequest.findMany({
    where: { status: VerifStatus.PENDING },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      mimeType: true,
      sizeBytes: true,
      universityOther: true,
      university: { select: { name: true, city: true } },
      user: { select: { id: true, name: true, image: true } },
    },
  });
}

/** Protected file access for admins; NOT_FOUND once the file has been deleted. */
export async function getVerificationFile(requestId: string, adminId: string, uploadDir: string) {
  await requireAdmin(adminId);
  const request = await prisma.verificationRequest.findUnique({
    where: { id: requestId },
    select: { filePath: true, mimeType: true },
  });
  if (!request?.filePath) {
    throw new DomainError("NOT_FOUND", "Datei nicht gefunden.");
  }
  return { path: uploadFilePath(uploadDir, request.filePath), mimeType: request.mimeType };
}
