import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NotifType, StaffRole, VerifStatus, prisma } from "@uni-scrims/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AUTO_REJECT_REASON,
  LEGACY_REJECT_REASON,
  MAX_UPLOAD_BYTES,
  MISSING_FILE_MESSAGE,
  autoRejectStaleVerifications,
  cleanupDecidedFiles,
  cleanupOrphanFiles,
  decideVerification,
  detectUploadType,
  getVerificationFile,
  getVerificationStatus,
  listPendingVerifications,
  listUniversities,
  resetLegacyVerifications,
  submitVerification,
} from "../src/index.ts";
import { NOW, createUser } from "./helpers.ts";

const PDF = new TextEncoder().encode(
  "%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n",
);
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  ),
);
const JPEG = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const HEIC = Uint8Array.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00,
  0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x63,
]);
const TEXT = new TextEncoder().encode("just some text, renamed to .pdf");

const DAY = 24 * 60 * 60 * 1000;
let uploadDir: string;
let universityId: string;
let admin: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
  // A reviewer: the queue is theirs (§5.9).
  admin = await createUser({ verified: true, staffRole: StaffRole.REVIEWER });
  const university = await prisma.university.create({
    data: { name: "Test-Uni", city: "Teststadt", slug: `test-${admin.id}` },
  });
  universityId = university.id;
});

beforeEach(async () => {
  uploadDir = await mkdtemp(path.join(tmpdir(), "uni-scrims-uploads-"));
  return () => rm(uploadDir, { recursive: true, force: true });
});

afterAll(async () => {
  await prisma.$disconnect();
});

function submit(userId: string, file: Uint8Array = PDF, overrides: object = {}) {
  return submitVerification({
    userId,
    universityId,
    consent: true,
    file,
    uploadDir,
    now: NOW,
    ...overrides,
  });
}

describe("detectUploadType", () => {
  it("accepts PDF, PNG and JPEG by magic bytes", async () => {
    expect(await detectUploadType(PDF)).toEqual({ mimeType: "application/pdf", ext: "pdf" });
    expect(await detectUploadType(PNG)).toEqual({ mimeType: "image/png", ext: "png" });
    expect(await detectUploadType(JPEG)).toEqual({ mimeType: "image/jpeg", ext: "jpg" });
  });

  it("rejects HEIC with a hint", async () => {
    await expect(detectUploadType(HEIC)).rejects.toThrow("Foto bitte als JPG/PNG");
  });

  it("rejects other content regardless of the file name", async () => {
    await expect(detectUploadType(TEXT)).rejects.toMatchObject({ code: "INVALID" });
  });

  it("rejects empty and too large files", async () => {
    await expect(detectUploadType(new Uint8Array())).rejects.toMatchObject({ code: "INVALID" });
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big.set(PDF);
    await expect(detectUploadType(big)).rejects.toThrow("5 MB");
  });
});

describe("verify page reads", () => {
  it("lists the universities by name", async () => {
    const names = (await listUniversities()).map((university) => university.name);
    expect(names).toContain("Test-Uni");
    expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  it("shows the latest request, or that the user is verified", async () => {
    const user = await createUser();
    expect(await getVerificationStatus(user.id)).toEqual({
      verifiedAt: null,
      university: null,
      latest: null,
    });
    await submit(user.id);
    expect(await getVerificationStatus(user.id)).toEqual({
      verifiedAt: null,
      university: null,
      latest: {
        status: VerifStatus.PENDING,
        rejectReason: null,
        createdAt: NOW,
        decidedAt: null,
        university: "Test-Uni",
      },
    });
    const verified = await createUser({ verified: true });
    expect(await getVerificationStatus(verified.id)).toMatchObject({ verifiedAt: NOW });
    const banned = await createUser({ banned: true });
    await expect(getVerificationStatus(banned.id)).rejects.toMatchObject({ code: "BANNED" });
  });
});

describe("submitVerification", () => {
  it("stores the file and creates a pending request", async () => {
    const user = await createUser();
    const request = await submit(user.id);
    expect(request).toMatchObject({
      status: VerifStatus.PENDING,
      pendingUserId: user.id,
      mimeType: "application/pdf",
      sizeBytes: PDF.byteLength,
      createdAt: NOW,
    });
    expect(await readdir(uploadDir)).toEqual([request.filePath]);
  });

  it("requires the consent checkbox", async () => {
    const user = await createUser();
    await expect(submit(user.id, PDF, { consent: false })).rejects.toMatchObject({
      code: "INVALID",
    });
  });

  it("requires exactly one of university and free text", async () => {
    const user = await createUser();
    await expect(submit(user.id, PDF, { universityId: null })).rejects.toMatchObject({
      code: "INVALID",
    });
    await expect(submit(user.id, PDF, { universityOther: "Andere Uni" })).rejects.toMatchObject({
      code: "INVALID",
    });
    await expect(
      submit(user.id, PDF, { universityId: null, universityOther: "Andere Uni" }),
    ).resolves.toMatchObject({ universityOther: "Andere Uni", universityId: null });
  });

  it("allows only one pending request per user", async () => {
    const user = await createUser();
    await submit(user.id);
    await expect(submit(user.id)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await readdir(uploadDir)).toHaveLength(1);
  });

  it("deletes the file again when the insert fails", async () => {
    const user = await createUser();
    // Two parallel uploads: one insert hits the unique pendingUserId and must clean up its file.
    const results = await Promise.allSettled([submit(user.id), submit(user.id)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await readdir(uploadDir)).toHaveLength(1);
  });

  it("rejects verified and banned users", async () => {
    const verified = await createUser({ verified: true });
    await expect(submit(verified.id)).rejects.toMatchObject({ code: "CONFLICT" });
    const banned = await createUser({ banned: true });
    await expect(submit(banned.id)).rejects.toMatchObject({ code: "BANNED" });
  });

  it("does not store invalid files", async () => {
    const user = await createUser();
    await expect(submit(user.id, HEIC)).rejects.toMatchObject({ code: "INVALID" });
    expect(await readdir(uploadDir)).toEqual([]);
  });
});

describe("decideVerification", () => {
  it("approves: verifies the user, deletes the file, queues the DM", async () => {
    const user = await createUser();
    const request = await submit(user.id);
    await decideVerification({
      requestId: request.id,
      adminId: admin.id,
      decision: "APPROVED",
      uploadDir,
      now: NOW,
    });

    const row = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(row).toMatchObject({
      status: VerifStatus.APPROVED,
      filePath: null,
      pendingUserId: null,
      decidedById: admin.id,
      decidedAt: NOW,
    });
    expect(existsSync(path.join(uploadDir, request.filePath!))).toBe(false);
    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser).toMatchObject({ verifiedAt: NOW, universityId });
    const notifications = await prisma.notification.findMany({ where: { targetUserId: user.id } });
    expect(notifications).toEqual([
      expect.objectContaining({
        type: NotifType.VERIFICATION_RESULT,
        channel: "PERSONAL",
        dedupeKey: `VERIFICATION_RESULT:${request.id}:${user.id}:PERSONAL`,
        scheduledFor: NOW,
        payload: { approved: true, rejectReason: null },
      }),
    ]);
  });

  it("assigns a seed university for 'Andere' on approval", async () => {
    const user = await createUser();
    const request = await submit(user.id, PDF, { universityId: null, universityOther: "Uni X" });
    await decideVerification({
      requestId: request.id,
      adminId: admin.id,
      decision: "APPROVED",
      universityId,
      uploadDir,
      now: NOW,
    });
    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser).toMatchObject({ universityId, universityOther: null });
  });

  it("keeps the free text when 'Andere' is approved without assignment", async () => {
    const user = await createUser();
    const request = await submit(user.id, PDF, { universityId: null, universityOther: "Uni X" });
    await decideVerification({
      requestId: request.id,
      adminId: admin.id,
      decision: "APPROVED",
      uploadDir,
      now: NOW,
    });
    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser).toMatchObject({ universityId: null, universityOther: "Uni X" });
  });

  it("rejects with a reason and allows a new upload", async () => {
    const user = await createUser();
    const request = await submit(user.id);
    await expect(
      decideVerification({
        requestId: request.id,
        adminId: admin.id,
        decision: "REJECTED",
        uploadDir,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    await decideVerification({
      requestId: request.id,
      adminId: admin.id,
      decision: "REJECTED",
      rejectReason: "Nicht lesbar",
      uploadDir,
      now: NOW,
    });
    const row = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(row).toMatchObject({ status: VerifStatus.REJECTED, rejectReason: "Nicht lesbar" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).verifiedAt).toBeNull();
    expect(await readdir(uploadDir)).toEqual([]);
    await expect(submit(user.id)).resolves.toMatchObject({ status: VerifStatus.PENDING });
  });

  it("decides only once", async () => {
    const user = await createUser();
    const request = await submit(user.id);
    const decide = () =>
      decideVerification({
        requestId: request.id,
        adminId: admin.id,
        decision: "APPROVED",
        uploadDir,
        now: NOW,
      });
    await decide();
    await expect(decide()).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("is admin only", async () => {
    const user = await createUser();
    const request = await submit(user.id);
    await expect(
      decideVerification({
        requestId: request.id,
        adminId: user.id,
        decision: "APPROVED",
        uploadDir,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listPendingVerifications(user.id, uploadDir)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(getVerificationFile(request.id, user.id, uploadDir)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("admin queue", () => {
  it("marks requests whose file is gone, and only lets them be rejected", async () => {
    const user = await createUser();
    const request = await submit(user.id);
    // E.g. after restoring a database backup: uploads are not backed up (ARCHITECTURE §8).
    await rm(path.join(uploadDir, request.filePath!));

    const queue = await listPendingVerifications(admin.id, uploadDir);
    expect(queue.find((entry) => entry.id === request.id)).toMatchObject({ fileAvailable: false });
    const decide = (decision: "APPROVED" | "REJECTED") =>
      decideVerification({
        requestId: request.id,
        adminId: admin.id,
        decision,
        rejectReason: decision === "REJECTED" ? "Bitte erneut hochladen" : null,
        uploadDir,
        now: NOW,
      });
    await expect(decide("APPROVED")).rejects.toMatchObject({
      code: "CONFLICT",
      message: MISSING_FILE_MESSAGE,
    });
    await expect(decide("REJECTED")).resolves.toBeUndefined();
    expect(
      await prisma.verificationRequest.findUnique({ where: { id: request.id } }),
    ).toMatchObject({ status: VerifStatus.REJECTED, filePath: null });
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toMatchObject({
      verifiedAt: null,
    });
  });

  it("lists pending requests oldest first and serves their files", async () => {
    const older = await createUser();
    const newer = await createUser();
    const first = await submit(older.id, PDF, { now: new Date(NOW.getTime() - 1000) });
    const second = await submit(newer.id, PNG);
    const queue = await listPendingVerifications(admin.id, uploadDir);
    const ids = queue.map((request) => request.id);
    expect(queue.find((request) => request.id === second.id)).toMatchObject({
      fileAvailable: true,
      // The real name to compare with the certificate (SPEC N-3).
      user: { firstName: newer.firstName, lastName: newer.lastName },
    });
    expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(second.id));
    expect(await getVerificationFile(second.id, admin.id, uploadDir)).toEqual({
      path: path.join(uploadDir, second.filePath!),
      mimeType: "image/png",
    });
  });
});

describe("janitor", () => {
  it("takes back the verification of accounts from before Phase 7 (SPEC N-3)", async () => {
    const verified = await createUser({ legacy: true, verified: true });
    await prisma.user.update({
      where: { id: verified.id },
      data: { universityId, universityOther: null },
    });
    const pending = await createUser({ legacy: true });
    const filePath = "legacy-pending.pdf";
    await writeFile(path.join(uploadDir, filePath), PDF);
    const request = await prisma.verificationRequest.create({
      data: {
        userId: pending.id,
        pendingUserId: pending.id,
        filePath,
        mimeType: "application/pdf",
        sizeBytes: PDF.byteLength,
        status: VerifStatus.PENDING,
        createdAt: NOW,
      },
    });
    // Complete accounts and deleted ones stay as they are.
    const complete = await createUser({ verified: true });
    const deleted = await createUser({ legacy: true, verified: true });
    await prisma.user.update({ where: { id: deleted.id }, data: { deletedAt: NOW } });

    expect(await resetLegacyVerifications(NOW, uploadDir)).toBeGreaterThanOrEqual(2);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: verified.id } })).toMatchObject({
      verifiedAt: null,
      universityId: null,
    });
    expect(
      await prisma.verificationRequest.findUniqueOrThrow({ where: { id: request.id } }),
    ).toMatchObject({
      status: VerifStatus.REJECTED,
      rejectReason: LEGACY_REJECT_REASON,
      decidedById: null,
      filePath: null,
    });
    expect(existsSync(path.join(uploadDir, filePath))).toBe(false);
    expect(
      await prisma.notification.count({
        where: { targetUserId: pending.id, type: NotifType.VERIFICATION_RESULT },
      }),
    ).toBe(1);
    for (const user of [complete, deleted]) {
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).verifiedAt).toEqual(
        NOW,
      );
    }
    // Idempotent.
    expect(await resetLegacyVerifications(NOW, uploadDir)).toBe(0);
  });

  it("auto-rejects pending requests after the TTL and deletes the file", async () => {
    const user = await createUser();
    const request = await submit(user.id);
    expect(await autoRejectStaleVerifications(new Date(NOW.getTime() + 13 * DAY), uploadDir)).toBe(
      0,
    );
    const later = new Date(NOW.getTime() + 14 * DAY);
    expect(await autoRejectStaleVerifications(later, uploadDir)).toBeGreaterThanOrEqual(1);
    const row = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(row).toMatchObject({
      status: VerifStatus.REJECTED,
      rejectReason: AUTO_REJECT_REASON,
      decidedById: null,
      pendingUserId: null,
      filePath: null,
    });
    expect(await readdir(uploadDir)).toEqual([]);
    expect(
      await prisma.notification.count({
        where: { targetUserId: user.id, type: NotifType.VERIFICATION_RESULT },
      }),
    ).toBe(1);
  });

  it("deletes leftover files of decided requests", async () => {
    const user = await createUser();
    const request = await submit(user.id);
    await prisma.verificationRequest.update({
      where: { id: request.id },
      data: { status: VerifStatus.REJECTED, pendingUserId: null },
    });
    expect(await cleanupDecidedFiles(uploadDir)).toBeGreaterThanOrEqual(1);
    expect(await readdir(uploadDir)).toEqual([]);
  });

  it("deletes orphan files older than 24 h only", async () => {
    const user = await createUser();
    const request = await submit(user.id);
    const oldOrphan = path.join(uploadDir, "old-orphan.pdf");
    const freshOrphan = path.join(uploadDir, "fresh-orphan.pdf");
    await writeFile(oldOrphan, PDF);
    await writeFile(freshOrphan, PDF);
    const old = new Date(Date.now() - 2 * DAY);
    await utimes(oldOrphan, old, old);
    await utimes(path.join(uploadDir, request.filePath!), old, old);

    expect(await cleanupOrphanFiles(uploadDir, new Date())).toBe(1);
    expect((await readdir(uploadDir)).sort()).toEqual(
      ["fresh-orphan.pdf", request.filePath].sort(),
    );
  });

  it("ignores a missing upload directory", async () => {
    expect(await cleanupOrphanFiles(path.join(uploadDir, "missing"), NOW)).toBe(0);
  });
});
