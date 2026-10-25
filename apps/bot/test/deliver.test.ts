import type { OutboxMessage } from "@uni-scrims/core";
import { DiscordAPIError, type REST } from "discord.js";
import { describe, expect, it } from "vitest";
import { createDeliver } from "../src/outbox/deliver.ts";

const MESSAGE = {
  id: "notification-1",
  type: "CHANNEL_BROKEN",
  payload: { teamName: "Team A" },
  recipient: { kind: "DM", userId: "user-1", discordId: "111", redirectedFrom: null },
  requestId: null,
  scrimId: null,
  opponentCaptain: null,
  feedbackDeadline: null,
  locale: "de",
} satisfies OutboxMessage;

/** A REST stand-in that records posts and answers with `answer`. */
function fakeRest(answer: (route: string) => unknown) {
  const posts: { route: string; body: unknown }[] = [];
  const rest = {
    post: async (route: string, options: { body: unknown }) => {
      posts.push({ route, body: options.body });
      const result = answer(route);
      if (result instanceof Error) throw result;
      return result;
    },
  } as unknown as REST;
  return { rest, posts };
}

function discordError(code: number, message: string) {
  return new DiscordAPIError({ code, message }, code, 403, "POST", "/channels/x/messages", {});
}

describe("createDeliver", () => {
  it("opens the DM channel and posts the message there", async () => {
    const { rest, posts } = fakeRest((route) =>
      route === "/users/@me/channels" ? { id: "dm-1" } : {},
    );
    expect(await createDeliver(rest, "https://scrims.example")(MESSAGE)).toEqual({ ok: true });
    expect(posts.map((post) => post.route)).toEqual([
      "/users/@me/channels",
      "/channels/dm-1/messages",
    ]);
    expect(posts[0]!.body).toEqual({ recipient_id: "111" });
    expect(posts[1]!.body).toMatchObject({ allowed_mentions: { parse: [] } });
  });

  it("posts team messages straight into the channel", async () => {
    const { rest, posts } = fakeRest(() => ({}));
    const message = {
      ...MESSAGE,
      recipient: { kind: "CHANNEL", channelId: "chan-1", redirectedFrom: null },
    } satisfies OutboxMessage;
    await createDeliver(rest, "https://scrims.example")(message);
    expect(posts.map((post) => post.route)).toEqual(["/channels/chan-1/messages"]);
  });

  it("reports Discord errors with their code and other errors without one", async () => {
    const blocked = fakeRest((route) =>
      route === "/users/@me/channels"
        ? { id: "dm-1" }
        : discordError(50007, "Cannot send messages to this user"),
    );
    expect(await createDeliver(blocked.rest, "https://scrims.example")(MESSAGE)).toEqual({
      ok: false,
      code: 50007,
      error: "50007: Cannot send messages to this user",
    });
    const offline = fakeRest(() => new Error("fetch failed"));
    expect(await createDeliver(offline.rest, "https://scrims.example")(MESSAGE)).toEqual({
      ok: false,
      code: null,
      error: "fetch failed",
    });
  });

  it("sends a mail through sendMail and never calls Discord", async () => {
    const { rest, posts } = fakeRest(() => ({}));
    const mails: unknown[] = [];
    const deliver = createDeliver(rest, "https://scrims.example", async (mail) => {
      mails.push(mail);
    });
    const message = {
      ...MESSAGE,
      recipient: {
        kind: "EMAIL",
        userId: "user-1",
        email: "ana@example.org",
        redirectedFrom: null,
      },
    } satisfies OutboxMessage;
    expect(await deliver(message)).toEqual({ ok: true });
    expect(posts).toEqual([]);
    expect(mails).toEqual([
      expect.objectContaining({ to: "ana@example.org", subject: "Team-Channel getrennt" }),
    ]);
  });

  it("reports a mail error without a code, so it is retried", async () => {
    const { rest } = fakeRest(() => ({}));
    const deliver = createDeliver(rest, "https://scrims.example", async () => {
      throw new Error("Greeting never received");
    });
    const message = {
      ...MESSAGE,
      recipient: {
        kind: "EMAIL",
        userId: "user-1",
        email: "ana@example.org",
        redirectedFrom: null,
      },
    } satisfies OutboxMessage;
    expect(await deliver(message)).toEqual({
      ok: false,
      code: null,
      error: "Greeting never received",
    });
  });
});
