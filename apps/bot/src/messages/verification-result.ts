import type { NotifType } from "@uni-scrims/db";
import { type MessageOf, type MessageParts, type TextFormat } from "./common.ts";

export function verificationResult(
  message: MessageOf<typeof NotifType.VERIFICATION_RESULT>,
  f: TextFormat,
): MessageParts {
  const { approved, rejectReason } = message.payload;
  if (approved) {
    return {
      title: "Verifizierung freigegeben",
      description: "Deine Immatrikulationsbescheinigung wurde geprüft. Du bist jetzt verifiziert.",
      link: { label: "Status ansehen", path: "/verify" },
    };
  }
  return {
    title: "Verifizierung abgelehnt",
    description:
      "Deine Immatrikulationsbescheinigung wurde abgelehnt. Du kannst eine neue hochladen.",
    fields: rejectReason ? [{ name: "Grund", value: f.text(rejectReason) }] : [],
    link: { label: "Neu hochladen", path: "/verify" },
  };
}
