import { rejectReasonText } from "@uni-scrims/core";
import type { NotifType } from "@uni-scrims/db";
import type { BotMessages } from "../i18n/messages.ts";
import { type MessageOf, type MessageParts, type TextFormat } from "./common.ts";

export function verificationResult(
  message: MessageOf<typeof NotifType.VERIFICATION_RESULT>,
  f: TextFormat,
  t: BotMessages,
): MessageParts {
  const { approved, rejectReason } = message.payload;
  if (approved) {
    return {
      title: t.verificationApproved.title,
      description: t.verificationApproved.description,
      link: { label: t.links.viewStatus, path: "/verify" },
    };
  }
  // The fixed reasons of core are stored in German and shown in the message's language (§5.22).
  const reason = rejectReason ? rejectReasonText(rejectReason, message.locale) : null;
  return {
    title: t.verificationRejected.title,
    description: t.verificationRejected.description,
    fields: reason ? [{ name: t.fields.reason, value: f.text(reason) }] : [],
    link: { label: t.links.uploadAgain, path: "/verify" },
  };
}
