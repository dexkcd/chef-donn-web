/** Dev/test only: the latest sign-in emails, so local login works without an email provider. */
import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { devMail } from "@/db/schema";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (env.isProd && !process.env.ENABLE_DEV_MAILBOX) return new Response("Not found", { status: 404 });
  const to = new URL(req.url).searchParams.get("to")?.toLowerCase();
  const rows = await db.select().from(devMail).orderBy(desc(devMail.createdAt)).limit(20);
  const mails = to ? rows.filter((m) => m.to.toLowerCase() === to) : rows;
  if (req.headers.get("accept")?.includes("application/json")) return Response.json(mails);
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<!doctype html><meta name=viewport content="width=device-width"><title>Dev mailbox</title>
<body style="font-family:system-ui;padding:16px;background:#f4f1ea"><h1>Dev mailbox</h1>${
    mails.length === 0
      ? "<p>No emails yet.</p>"
      : mails.map((m) => `<p><b>${esc(m.to)}</b> · ${m.createdAt.toISOString()}<br><a href="${esc(m.url ?? "#")}">Sign in</a></p>`).join("")
  }</body>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
