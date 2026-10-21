import { readFile } from "node:fs/promises";
import { getVerificationFile, isDomainError, resolveUploadDir } from "@uni-scrims/core";
import { getSessionUserId } from "@/lib/session";

const STATUS_BY_CODE: Record<string, number> = {
  UNAUTHENTICATED: 401,
  BANNED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
};

// Protected file access for the admin queue (ARCHITECTURE §5.2). Excluded from the global
// frame-ancestors 'none' in next.config.ts so the queue can embed the preview.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) return new Response(null, { status: 401 });

  let file: { path: string; mimeType: string };
  let bytes: Buffer;
  try {
    file = await getVerificationFile(id, userId, resolveUploadDir());
    bytes = await readFile(file.path);
  } catch (error) {
    if (isDomainError(error)) {
      return new Response(null, { status: STATUS_BY_CODE[error.code] ?? 400 });
    }
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return new Response(null, { status: 404 });
    }
    throw error;
  }

  const isImage = file.mimeType.startsWith("image/");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      // PDFs get sandbox only if the preview still works with it in Chrome and Firefox (§5.2).
      "Content-Security-Policy": isImage
        ? "sandbox; frame-ancestors 'self'"
        : "frame-ancestors 'self'",
    },
  });
}
