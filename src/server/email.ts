import { db } from "@/db/client";
import { devMail } from "@/db/schema";
import { env } from "./env";

/**
 * Send a sign-in link. In production this goes through Resend; locally (and in tests) it is
 * written to the dev mailbox at /api/dev/mailbox and printed to the console.
 */
export async function sendMagicLinkEmail(to: string, url: string): Promise<void> {
  const subject = "Your Chef Donn's sign-in link";
  const body = `Tap to sign in to Chef Donn's:\n\n${url}\n\nThe link works once and expires in 15 minutes. If you didn't ask for it, ignore this email.`;

  if (env.resendApiKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.mailFrom, to, subject, text: body }),
    });
    if (!res.ok) throw new Error(`Email provider refused the message (${res.status})`);
    return;
  }
  if (env.isProd && !process.env.ENABLE_DEV_MAILBOX) throw new Error("RESEND_API_KEY is not set — sign-in emails can't be sent.");

  await db.insert(devMail).values({ to, subject, url, body });
  console.info(`[dev-mail] sign-in link for ${to}: ${url}`);
}
