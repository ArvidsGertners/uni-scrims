// Better Auth with Discord (ARCHITECTURE §5.1). Sessions live in the database; the cookie cache stays off
// (default) so bans and account deletion take effect immediately.
import { handleDiscordLogin } from "@uni-scrims/core";
import { prisma } from "@uni-scrims/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { isAllowedAuthPath } from "./auth-paths.ts";
import { devLogin } from "./dev-login-plugin.ts";
import { joinHubGuild } from "./hub-join.ts";

// Set only by core, never by the client.
const coreOnly = { required: false, input: false } as const;

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  socialProviders: {
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
      // Without disableDefaultScope the email scope is requested anyway.
      disableDefaultScope: true,
      scope: ["identify", "guilds.join"],
      overrideUserInfoOnSignIn: true,
      mapProfileToUser: (profile) => ({
        // Better Auth requires an email; Discord sends none without the email scope. Never used for sending.
        email: `${profile.id}@users.uniscrims.invalid`,
        // The default is the display name (global_name), which is neither unique nor searchable.
        // Captains find the opposing captain on Discord by this name (SPEC P0-6). Accounts not yet
        // migrated to unique usernames are only unique with their discriminator (name#1234).
        name:
          profile.discriminator && profile.discriminator !== "0"
            ? `${profile.username}#${profile.discriminator}`
            : profile.username,
      }),
    },
  },
  user: {
    additionalFields: {
      universityId: { type: "string", ...coreOnly },
      universityOther: { type: "string", ...coreOnly },
      verifiedAt: { type: "date", ...coreOnly },
      bannedAt: { type: "date", ...coreOnly },
      hubJoinFailedAt: { type: "date", ...coreOnly },
      dmFailedAt: { type: "date", ...coreOnly },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (!isAllowedAuthPath(ctx.path)) throw new APIError("NOT_FOUND");
    }),
    // After the OAuth callback the account row holds the fresh Discord tokens (created on the first
    // login, updated on every further one). Join the hub, then remove them. The login always continues.
    after: createAuthMiddleware(async (ctx) => {
      if (!ctx.path.startsWith("/callback/")) return;
      const userId = ctx.context.newSession?.user.id;
      if (!userId) return;
      try {
        await handleDiscordLogin(userId, joinHubGuild, new Date());
      } catch (error) {
        console.error("Post-login handling failed", error);
      }
    }),
  },
  // nextCookies must stay last.
  plugins: [devLogin(), nextCookies()],
});
