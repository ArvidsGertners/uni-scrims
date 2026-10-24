// Discord and mail side of the outbox sender (ARCHITECTURE §6.2, §5.17): build the message and
// send it. Relevance, recipients and what an error means are decided in core (deliverNotification).
import type { Deliver } from "@uni-scrims/core";
import { sendMail as smtpSendMail } from "@uni-scrims/core/mail";
import { DiscordAPIError, type REST, Routes } from "discord.js";
import { buildMessage } from "../messages/index.ts";
import { buildMail } from "../messages/mail.ts";

/** Opens (or reuses) the DM channel with a user. */
async function dmChannelId(rest: REST, discordId: string): Promise<string> {
  const channel = (await rest.post(Routes.userChannels(), {
    body: { recipient_id: discordId },
  })) as { id: string };
  return channel.id;
}

/** Never throws: Discord errors come back with their code, everything else with code null. */
export function createDeliver(
  rest: REST,
  baseUrl: string,
  sendMail: typeof smtpSendMail = smtpSendMail,
): Deliver {
  return async (message) => {
    try {
      if (message.recipient.kind === "EMAIL") {
        await sendMail(buildMail(message, message.recipient.email, baseUrl));
        return { ok: true };
      }
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
