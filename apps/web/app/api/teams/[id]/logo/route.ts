import { getTeamLogo, isDomainError } from "@uni-scrims/core";
import { statusForDomainError } from "@/lib/route-status";
import { getSessionUserId } from "@/lib/session";

// Team logo for logged-in users (SPEC N-6, ARCHITECTURE §5.11). A URL with the current version may
// stay in the browser cache for good, as a new logo gets a new URL; any other version is served
// uncached, so an old URL never keeps a newer logo.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) return new Response(null, { status: 401 });

  let logo: Awaited<ReturnType<typeof getTeamLogo>>;
  try {
    logo = await getTeamLogo({ userId, teamId: id });
  } catch (error) {
    if (isDomainError(error)) {
      return new Response(null, { status: statusForDomainError(error) });
    }
    throw error;
  }

  const current = new URL(request.url).searchParams.get("v") === String(logo.version);
  return new Response(logo.data, {
    headers: {
      // Always the WebP the server made itself (§5.11).
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": current ? "private, max-age=31536000, immutable" : "no-store",
    },
  });
}
