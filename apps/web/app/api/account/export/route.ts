import {
  type AccountExport,
  exportAccountData,
  isDomainError,
  resolveUploadDir,
  toBerlinDateString,
} from "@uni-scrims/core";
import { getSessionUserId } from "@/lib/session";

// Data export per button (SPEC N-5, ARCHITECTURE §5.10): the account page links here; the browser
// saves the JSON as a file. Banned and incomplete accounts too, deleted ones count as logged out.
export async function GET(request: Request): Promise<Response> {
  const userId = await getSessionUserId();
  if (!userId) return new Response(null, { status: 401 });

  const now = new Date();
  let data: AccountExport;
  try {
    data = await exportAccountData({
      userId,
      now,
      // As the invite links; the request's own address if the variable is missing.
      privacyPolicyUrl: new URL(
        "/datenschutz",
        process.env.BETTER_AUTH_URL || request.url,
      ).toString(),
      uploadDir: resolveUploadDir(),
    });
  } catch (error) {
    if (isDomainError(error) && error.code === "UNAUTHENTICATED") {
      return new Response(null, { status: 401 });
    }
    throw error;
  }

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="uni-scrims-daten-${toBerlinDateString(now)}.json"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
