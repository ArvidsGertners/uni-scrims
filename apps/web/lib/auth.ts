// Better Auth with email and password, Discord linked to the account (ARCHITECTURE §5.1, §5.8).
// Sessions live in the database; the cookie cache stays off (default) so bans and account deletion
// take effect immediately.
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  accountCreateProblem,
  discordLoginUserInfo,
  finishTwoFactorSetup,
  handleDiscordLogin,
  hasStaffRole,
} from "@uni-scrims/core";
import { prisma } from "@uni-scrims/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { adminOrigin, sharedCookieDomain } from "./admin-url.ts";
import { isAllowedAuthPath, staffSessionAllowed, staffSessionError } from "./auth-paths.ts";
import { devLogin } from "./dev-login-plugin.ts";
import { fetchDiscordImage, fetchDiscordProfile } from "./discord-avatar.ts";
import { joinHubGuild } from "./hub-join.ts";
import { MAIL_FAILED, type Mail, passwordResetMail, sendMail, verificationMail } from "./mail.ts";

// Set only by core, never by the client.
const coreOnly = { required: false, input: false } as const;
// Set by the registration's server call (§5.8); the endpoint is closed over HTTP.
const registrationOnly = { required: false, input: true } as const;

/**
 * Fresh Discord tokens arrive with an account row: created when Discord is linked, updated on every
 * Discord login. Join the hub, copy the avatar (§5.12), then remove the tokens. Login and linking always continue; the row
 * is null when the account was deleted meanwhile.
 */
async function onDiscordTokens(account: { userId: string; providerId: string } | null) {
  try {
    if (account?.providerId !== "discord") return;
    await handleDiscordLogin(
      account.userId,
      joinHubGuild,
      { fetchProfile: fetchDiscordProfile, fetchImage: fetchDiscordImage },
      new Date(),
    );
  } catch (error) {
    console.error("Post-login handling failed", error);
  }
}

/**
 * Sends an account mail. Better Auth sends most of them in the background (`backgroundTasks`), so
 * no answer waits for the mail server and none tells whether an address exists; failures are
 * logged. The resend from the setup page waits and reports MAIL_FAILED (lib/action.ts).
 */
async function sendAccountMail(mail: Mail) {
  try {
    await sendMail(mail);
  } catch (error) {
    console.error("Could not send an account mail", error);
    throw new APIError("INTERNAL_SERVER_ERROR", { code: "MAIL_FAILED", message: MAIL_FAILED });
  }
}

// The admin area on its own host shares the login (§5.13).
const admin = adminOrigin();
const cookieDomain = sharedCookieDomain();

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  // Signing out from the admin host.
  trustedOrigins: admin ? [admin] : [],
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: PASSWORD_MIN,
    maxPasswordLength: PASSWORD_MAX,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendAccountMail(passwordResetMail(user.email, url));
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    // A login with an unconfirmed address sends the link again (and fails with EMAIL_NOT_VERIFIED).
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 24 * 60 * 60,
    // Also for a new address: Better Auth sends it there and switches after the click.
    sendVerificationEmail: async ({ user, url }) => {
      await sendAccountMail(verificationMail(user.email, url));
    },
  },
  socialProviders: {
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
      // Without disableDefaultScope the email scope is requested anyway.
      disableDefaultScope: true,
      scope: ["identify", "guilds.join"],
      // A Discord login finds linked accounts only and never creates one (SPEC N-3); disableSignUp,
      // because the client could turn disableImplicitSignUp off with requestSignUp.
      disableImplicitSignUp: true,
      disableSignUp: true,
      // Name and avatar on every Discord login. In 1.7.12 this also writes the email, so the
      // profile carries the account's own address, and a ban placeholder its own values.
      overrideUserInfoOnSignIn: true,
      mapProfileToUser: (profile) => discordLoginUserInfo(profile),
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      // Discord gives no confirmed address without the email scope, and the placeholder never
      // matches the account's address.
      trustedProviders: ["discord"],
      allowDifferentEmails: true,
      // Name and avatar from the same profile (never email); the first name of the registration
      // is never shown (NEW_ACCOUNT_NAME).
      updateUserInfoOnLink: true,
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
      // The language shown at the registration (§5.21), so later mails have one (Phase 23).
      locale: { type: "string", ...registrationOnly },
    },
  },
  advanced: {
    // All Better Auth cookies, also the one of a pending 2FA login, for both hosts. Under their own
    // name, so no host-only cookie of the same name shadows them when ADMIN_URL is switched on or
    // off; everybody signs in once more then.
    ...(cookieDomain
      ? {
          cookiePrefix: "uni-scrims",
          crossSubDomainCookies: { enabled: true, domain: cookieDomain },
        }
      : {}),
    // nginx and Caddy overwrite this header with the client address (ARCHITECTURE §8).
    ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    // One long-running web process: the mail promise just runs on; Better Auth logs failures.
    backgroundTasks: { handler: () => {} },
  },
  databaseHooks: {
    account: {
      create: {
        // No row for deleted or banned users (a link or reset finishing late), and Discord only
        // once per user (§5.8); unique indexes back this up.
        before: async (account) => (await accountCreateProblem(account)) === null,
        after: onDiscordTokens,
      },
      update: { after: onDiscordTokens },
    },
    session: {
      create: {
        // Staff get sessions from password and code only (§5.9); a Discord login or a mail link
        // would skip the code, so it goes back to the login page with a hint. Linking Discord
        // creates no session and still works.
        before: async (session, ctx) => {
          if (staffSessionAllowed(ctx?.path) || !(await hasStaffRole(session.userId))) return;
          if (!ctx) return false;
          throw ctx.redirect(`/login?error=${staffSessionError(ctx.path)}`);
        },
      },
    },
    user: {
      update: {
        // The setup's first code switches the 2FA on, from whichever page it came (§5.9).
        after: async (user, ctx) => {
          if (ctx?.path === "/two-factor/verify-totp") await finishTwoFactorSetup(user.id);
        },
      },
    },
  },
  hooks: {
    // Calls through auth.api come without an HTTP request (server actions, §5.8).
    before: createAuthMiddleware(async (ctx) => {
      if (!isAllowedAuthPath(ctx.path, !ctx.request)) throw new APIError("NOT_FOUND");
    }),
  },
  plugins: [
    // TOTP for staff (§5.9): no email OTP, and no "trust this device", which would skip the code.
    twoFactor({ issuer: "Uni Scrims", backupCodeOptions: { amount: 10 } }),
    devLogin(),
    // nextCookies must stay last.
    nextCookies(),
  ],
});
