import { getPublicTeamLogo, getTeamLogo, isDomainError } from "@uni-scrims/core";
import type { LogoBackground } from "@uni-scrims/db";
import { statusForDomainError } from "@/lib/route-status";
import { getSessionUserId } from "@/lib/session";

const BACKGROUNDS = new Map<string | null, LogoBackground>([
  ["dark", "DARK"],
  ["light", "LIGHT"],
]);

/**
 * With a user getTeamLogo, else the public rule. A session left of a deleted account counts as
 * none, as on the pages (getSignedInUser), so the public board keeps its logos.
 */
async function loadLogo(userId: string | null, teamId: string, background: LogoBackground) {
  if (userId) {
    try {
      return await getTeamLogo({ userId, teamId, background });
    } catch (error) {
      if (!isDomainError(error) || error.code !== "UNAUTHENTICATED") throw error;
    }
  }
  return getPublicTeamLogo({ teamId, background, now: new Date() });
}

// Team logo for one background (`bg`) for logged-in users (SPEC N-6, N-7, ARCHITECTURE §5.11),
// without login only of teams on the public board (SPEC N-24, §5.26). A URL with the current
// version may stay in the browser cache for good, as a new logo gets a new URL; any other version
// is served uncached, so an old URL never keeps a newer logo.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const userId = await getSessionUserId();
  const search = new URL(request.url).searchParams;
  const background = BACKGROUNDS.get(search.get("bg"));
  if (!background) return new Response(null, { status: 404 });

  let logo: Awaited<ReturnType<typeof getTeamLogo>>;
  try {
    logo = await loadLogo(userId, id, background);
  } catch (error) {
    if (isDomainError(error)) {
      return new Response(null, { status: statusForDomainError(error) });
    }
    throw error;
  }

  const current = search.get("v") === String(logo.version);
  return new Response(logo.data, {
    headers: {
      // Always the WebP the server made itself (§5.11).
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
      // Like the public board itself, the logos on it are not for search engines (SPEC N-24).
      "X-Robots-Tag": "noindex",
      "Cache-Control": current ? "private, max-age=31536000, immutable" : "no-store",
    },
  });
}
