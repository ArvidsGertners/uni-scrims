// Better Auth with email and password, Discord linked to the account (ARCHITECTURE §5.1, §5.8).
// Sessions live in the database; the cookie cache stays off (default) so bans and account deletion
// take effect immediately.
import { PASSWORD_MAX, PASSWORD_MIN, handleDiscordLogin } from "@uni-scrims/core";
import { prisma } from "@uni-scrims/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { isAllowedAuthPath } from "./auth-paths.ts";
import { devLogin } from "./dev-login-plugin.ts";
import { fetchDiscordProfile, joinHubGuild } from "./hub-join.ts";
import { passwordResetMail, sendMail, verificationMail } from "./mail.ts";

// Set only by core, never by the client.
const coreOnly = { required: false, input: false } as const;
// Set by the registration's server call (§5.8); the endpoint is closed over HTTP.
const registrationOnly = { required: false, input: true } as const;

/**
 * Fresh Discord tokens arrive with an account row: created when Discord is linked, updated on every
 * Discord login. Take over name and avatar, join the hub, then remove the tokens. Login and linking
 * always continue.
 */
async function onDiscordTokens(account: { userId: string; providerId: string }) {
  if (account.providerId !== "discord") return;
  try {
    await handleDiscordLogin(
      account.userId,
      { joinHub: joinHubGuild, fetchProfile: fetchDiscordProfile },
      new Date(),
    );
  } catch (error) {
    console.error("Post-login handling failed", error);
  }
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: PASSWORD_MIN,
    maxPasswordLength: PASSWORD_MAX,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendMail(passwordResetMail(user.email, url));
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 24 * 60 * 60,
    // Also for a new address: Better Auth sends it there and switches after the click.
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail(verificationMail(user.email, url));
    },
  },
  socialProviders: {
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
      // Without disableDefaultScope the email scope is requested anyway.
      disableDefaultScope: true,
      scope: ["identify", "guilds.join"],
      // A Discord login finds linked accounts only and never creates one (SPEC N-3).
      disableImplicitSignUp: true,
      // In 1.7.12 this would also overwrite the account's email with the placeholder below; name
      // and avatar come from the login hook instead (onDiscordTokens).
      overrideUserInfoOnSignIn: false,
      // Better Auth needs an email; Discord sends none without the email scope. Never stored: a
      // Discord login creates no user, and linking keeps the account's address.
      mapProfileToUser: (profile) => ({ email: `${profile.id}@users.uniscrims.invalid` }),
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      // Discord gives no confirmed address without the email scope, and the placeholder never
      // matches the account's address.
      trustedProviders: ["discord"],
      allowDifferentEmails: true,
    },
  },
  user: {
    changeEmail: { enabled: true },
    additionalFields: {
      universityId: { type: "string", ...coreOnly },
      universityOther: { type: "string", ...coreOnly },
      verifiedAt: { type: "date", ...coreOnly },
      bannedAt: { type: "date", ...coreOnly },
      hubJoinFailedAt: { type: "date", ...coreOnly },
      dmFailedAt: { type: "date", ...coreOnly },
      deletedAt: { type: "date", ...coreOnly },
      firstName: { type: "string", ...registrationOnly },
      lastName: { type: "string", ...registrationOnly },
    },
  },
  advanced: {
    // nginx and Caddy overwrite this header with the client address (ARCHITECTURE §8).
    ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
  },
  databaseHooks: {
    account: {
      create: { after: onDiscordTokens },
      update: { after: onDiscordTokens },
    },
  },
  hooks: {
    // Calls through auth.api come without an HTTP request (server actions, §5.8).
    before: createAuthMiddleware(async (ctx) => {
      if (!isAllowedAuthPath(ctx.path, !ctx.request)) throw new APIError("NOT_FOUND");
    }),
  },
  // nextCookies must stay last.
  plugins: [devLogin(), nextCookies()],
});
