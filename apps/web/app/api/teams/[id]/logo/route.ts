import { getTeamLogo, isDomainError } from "@uni-scrims/core";
import { getSessionUserId } from "@/lib/session";

const STATUS_BY_CODE: Record<string, number> = {
  UNAUTHENTICATED: 401,
  BANNED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
};

// Team logo for logged-in users (SPEC N-6, ARCHITECTURE §5.11). The URL carries the logo version,
// so the browser may keep it for good; a new logo gets a new URL.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) return new Response(null, { status: 401 });

  let logo: Uint8Array<ArrayBuffer>;
  try {
    logo = await getTeamLogo({ userId, teamId: id });
  } catch (error) {
    if (isDomainError(error)) {
      return new Response(null, { status: STATUS_BY_CODE[error.code] ?? 400 });
    }
    throw error;
  }

  return new Response(logo, {
    headers: {
      // Always the WebP the server made itself (§5.11).
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
