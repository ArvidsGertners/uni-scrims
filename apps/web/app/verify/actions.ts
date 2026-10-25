"use server";

import { resolveUploadDir, submitVerification } from "@uni-scrims/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, runAction } from "@/lib/action";
import { getSessionUserId } from "@/lib/session";
import { getMessages } from "@/lib/locale";
import { verifyActionMessages } from "@/i18n/account";
import { OTHER_UNIVERSITY } from "./constants";

const schema = z.object({
  university: z.string().min(1),
  // Length is checked by core (MAX_UNIVERSITY_OTHER_LENGTH) with a specific message.
  universityOther: z.string().optional(),
  consent: z.literal("on"),
  file: z.instanceof(File),
});

export async function submitVerificationAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await getSessionUserId();
  const parsed = schema.safeParse({
    university: formData.get("university"),
    universityOther: formData.get("universityOther") ?? undefined,
    consent: formData.get("consent"),
    file: formData.get("file"),
  });
  if (!parsed.success) {
    return { error: (await getMessages(verifyActionMessages)).invalidForm };
  }
  const { university, universityOther, file } = parsed.data;
  const other = university === OTHER_UNIVERSITY;
  const state = await runAction(async () => {
    await submitVerification({
      userId: userId ?? "",
      universityId: other ? null : university,
      universityOther: other ? (universityOther ?? "") : null,
      consent: true,
      file: new Uint8Array(await file.arrayBuffer()),
      uploadDir: resolveUploadDir(),
      now: new Date(),
    });
  });
  revalidatePath("/verify");
  return state;
}
