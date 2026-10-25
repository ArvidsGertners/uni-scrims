import type { NotifType } from "@uni-scrims/db";
import type { BotMessages } from "../i18n/messages.ts";
import { type MessageOf, type MessageParts, team, type TextFormat } from "./common.ts";

export function channelBroken(
  message: MessageOf<typeof NotifType.CHANNEL_BROKEN>,
  f: TextFormat,
  t: BotMessages,
): MessageParts {
  return {
    title: t.channelBroken.title,
    description: t.channelBroken.description(team(message.payload.teamName, f), f.code("/setup")),
    link: { label: t.links.team, path: "/team" },
  };
}
