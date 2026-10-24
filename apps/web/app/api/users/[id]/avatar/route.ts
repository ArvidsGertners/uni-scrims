import { getUserAvatar, isDomainError } from "@uni-scrims/core";
import { statusForDomainError } from "@/lib/route-status";
import { getSessionUserId } from "@/lib/session";

// Copy of a user's Discord avatar (SPEC N-8, ARCHITECTURE §5.12) for the person, teammates and
// staff; everybody else gets 404 like a missing one. Cache rules as for team logos (§5.11).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) return new Response(null, { status: 401 });

  let avatar: Awaited<ReturnType<typeof getUserAvatar>>;
  try {
    avatar = await getUserAvatar({ viewerId: userId, userId: id });
  } catch (error) {
    if (isDomainError(error)) {
      return new Response(null, { status: statusForDomainError(error) });
    }
    throw error;
  }

  const current = new URL(request.url).searchParams.get("v") === String(avatar.version);
  return new Response(avatar.data, {
    headers: {
      // Always the WebP the server made itself (§5.12).
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": current ? "private, max-age=31536000, immutable" : "no-store",
    },
  });
}
