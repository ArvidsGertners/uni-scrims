import type { NotifType } from "@uni-scrims/db";
import { type MessageOf, type MessageParts, team, type TextFormat } from "./common.ts";

export function channelBroken(
  message: MessageOf<typeof NotifType.CHANNEL_BROKEN>,
  f: TextFormat,
): MessageParts {
  return {
    title: "Team-Channel getrennt",
    description: `Der Bot kann nicht mehr in den Team-Channel von ${team(message.payload.teamName, f)} schreiben, darum wurde die Verknüpfung entfernt. Posts für das ganze Team gibt es erst wieder mit einem neuen Channel; persönliche Benachrichtigungen kommen weiter per DM oder Mail, wie in den Einstellungen gewählt. Mit ${f.code("/setup")} verknüpfst du einen Channel neu.`,
    link: { label: "Zum Team", path: "/team" },
  };
}
