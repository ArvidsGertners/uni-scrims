import type { NotifType } from "@uni-scrims/db";
import { type MessageOf, type MessageParts, plain } from "./common.ts";

export function channelBroken(message: MessageOf<typeof NotifType.CHANNEL_BROKEN>): MessageParts {
  return {
    title: "Team-Channel getrennt",
    description: `Der Bot kann nicht mehr in den Team-Channel von **${plain(message.payload.teamName)}** schreiben, darum wurde die Verknüpfung entfernt. Nachrichten kommen jetzt nur noch per DM. Mit \`/setup\` kannst du einen Channel neu verknüpfen.`,
    link: { label: "Zum Team", path: "/team" },
  };
}
