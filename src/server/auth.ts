import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import { db } from "@/db/client";
import { account, session, user, verification } from "@/db/schema";
import { sendMagicLinkEmail } from "./email";
import { env } from "./env";
import { mayReceiveSignInLink } from "./membership";

export const auth = betterAuth({
  appName: "Chef Donn's",
  baseURL: env.appUrl,
  secret: env.authSecret,
  trustedOrigins: [env.appUrl],
  database: drizzleAdapter(db, { provider: "pg", schema: { user, session, account, verification } }),
  emailAndPassword: { enabled: false },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  plugins: [
    magicLink({
      expiresIn: 15 * 60,
      storeToken: "hashed",
      // Invite-only. Unknown emails get the same "check your email" answer but no link,
      // so the form doesn't reveal who is invited.
      sendMagicLink: async ({ email, url }) => {
        if (!(await mayReceiveSignInLink(email))) {
          console.info(`[auth] sign-in link not sent: ${email} is not invited`);
          return;
        }
        await sendMagicLinkEmail(email, url);
      },
    }),
    nextCookies(),
  ],
});
