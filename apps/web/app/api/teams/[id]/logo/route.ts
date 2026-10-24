import { getTeamLogo, isDomainError } from "@uni-scrims/core";
import type { LogoBackground } from "@uni-scrims/db";
import { statusForDomainError } from "@/lib/route-status";
import { getSessionUserId } from "@/lib/session";

const BACKGROUNDS: Record<string, LogoBackground> = { dark: "DARK", light: "LIGHT" };

// Team logo for one background (`bg`) for logged-in users (SPEC N-6, N-7, ARCHITECTURE §5.11). A URL with the current version may
// stay in the browser cache for good, as a new logo gets a new URL; any other version is served
// uncached, so an old URL never keeps a newer logo.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) return new Response(null, { status: 401 });
  const search = new URL(request.url).searchParams;
  const background = BACKGROUNDS[search.get("bg") ?? ""];
  if (!background) return new Response(null, { status: 404 });

  let logo: Awaited<ReturnType<typeof getTeamLogo>>;
  try {
    logo = await getTeamLogo({ userId, teamId: id, background });
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
      "Cache-Control": current ? "private, max-age=31536000, immutable" : "no-store",
    },
  });
}
