// Dev login (ARCHITECTURE §7): sign in as a seed user without Discord.
// Only works with NODE_ENV=development and DEV_LOGIN=true; otherwise the endpoint answers 404.
import { SEED_USER_PREFIX } from "@uni-scrims/core";
import { isDevLoginEnabled } from "@uni-scrims/core/config/dev";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

export function devLogin() {
  return {
    id: "dev-login",
    endpoints: {
      devSignIn: createAuthEndpoint(
        "/dev/sign-in",
        { method: "POST", body: z.object({ userId: z.string() }) },
        async (ctx) => {
          if (!isDevLoginEnabled() || !ctx.body.userId.startsWith(SEED_USER_PREFIX)) {
            throw new APIError("NOT_FOUND");
          }
          const user = await ctx.context.internalAdapter.findUserById(ctx.body.userId);
          if (!user) throw new APIError("NOT_FOUND");
          const session = await ctx.context.internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ ok: true });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
