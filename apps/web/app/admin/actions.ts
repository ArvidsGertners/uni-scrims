"use server";

import { decideVerification, resolveUploadDir } from "@uni-scrims/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, runAction } from "@/lib/action";
import { getSessionUserId } from "@/lib/session";

const schema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  rejectReason: z.string().max(500).optional(),
  universityId: z.string().optional(),
});

export async function decideVerificationAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const adminId = await getSessionUserId();
  const parsed = schema.safeParse({
    requestId: formData.get("requestId"),
    decision: formData.get("decision"),
    rejectReason: formData.get("rejectReason") ?? undefined,
    universityId: formData.get("universityId") ?? undefined,
  });
  if (!parsed.success) return { error: "Ungültige Eingabe." };
  const state = await runAction(async () => {
    await decideVerification({
      ...parsed.data,
      adminId: adminId ?? "",
      uploadDir: resolveUploadDir(),
      now: new Date(),
    });
  });
  revalidatePath("/admin");
  return state;
}
