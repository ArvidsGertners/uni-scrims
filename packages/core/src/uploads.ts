// Storage of verification uploads in UPLOAD_DIR (ARCHITECTURE §5.2). Files are never publicly reachable.
// VerificationRequest.filePath stores only the generated file name; it is resolved against uploadDir.
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { DomainError } from "./errors.ts";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export type UploadType = { mimeType: string; ext: string };

/** Checks the real size and the type via magic bytes; the client-provided name and MIME are ignored. */
export async function detectUploadType(bytes: Uint8Array): Promise<UploadType> {
  if (bytes.byteLength === 0) {
    throw new DomainError("INVALID", "Die Datei ist leer.");
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new DomainError("INVALID", "Die Datei ist größer als 5 MB.");
  }
  const detected = await fileTypeFromBuffer(bytes);
  if (detected?.ext === "heic") {
    throw new DomainError(
      "INVALID",
      "HEIC wird nicht unterstützt. Foto bitte als JPG/PNG hochladen.",
    );
  }
  const ext = detected ? ALLOWED_TYPES[detected.mime] : undefined;
  if (!detected || !ext) {
    throw new DomainError("INVALID", "Erlaubt sind nur PDF, JPG und PNG.");
  }
  return { mimeType: detected.mime, ext };
}

/** UPLOAD_DIR must be absolute, so web and tests never depend on the working directory. */
export function resolveUploadDir(env: Record<string, string | undefined> = process.env): string {
  const dir = env.UPLOAD_DIR;
  if (!dir || !path.isAbsolute(dir)) {
    throw new Error("UPLOAD_DIR must be set to an absolute path");
  }
  return dir;
}

export function uploadFilePath(uploadDir: string, fileName: string): string {
  // basename: a stored name can never point outside the upload directory.
  return path.join(uploadDir, path.basename(fileName));
}

export async function storeUpload(uploadDir: string, bytes: Uint8Array, ext: string) {
  await mkdir(uploadDir, { recursive: true, mode: 0o700 });
  const fileName = `${randomUUID()}.${ext}`;
  await writeFile(uploadFilePath(uploadDir, fileName), bytes, { flag: "wx", mode: 0o600 });
  return fileName;
}

/** Deletes an upload; a file that is already gone counts as deleted. */
export async function deleteUpload(uploadDir: string, fileName: string): Promise<void> {
  try {
    await unlink(uploadFilePath(uploadDir, fileName));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
