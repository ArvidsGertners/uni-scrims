// Discord side of the outbox sender (ARCHITECTURE §6.2): build the message and post it.
// Relevance, recipients and what an error means are decided in core (deliverNotification).
import type { Deliver } from "@uni-scrims/core";
import { DiscordAPIError, type REST, Routes } from "discord.js";
import { buildMessage } from "../messages/index.ts";

/** Opens (or reuses) the DM channel with a user. */
async function dmChannelId(rest: REST, discordId: string): Promise<string> {
  const channel = (await rest.post(Routes.userChannels(), {
    body: { recipient_id: discordId },
  })) as { id: string };
  return channel.id;
}

/** Never throws: Discord errors come back with their code, everything else with code null. */
export function createDeliver(rest: REST, baseUrl: string): Deliver {
  return async (message) => {
    try {
      const body = buildMessage(message, baseUrl);
      const channelId =
        message.recipient.kind === "DM"
          ? await dmChannelId(rest, message.recipient.discordId)
          : message.recipient.channelId;
      await rest.post(Routes.channelMessages(channelId), { body });
      return { ok: true };
    } catch (error) {
      if (error instanceof DiscordAPIError) {
        const code = typeof error.code === "number" ? error.code : null;
        return { ok: false, code, error: `${error.code}: ${error.message}` };
      }
      return {
        ok: false,
        code: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
}
