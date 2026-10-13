"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/ui/form";
import { auth } from "../auth";
import { str } from "./form";

const emailSchema = z.email("Enter the email address you were invited with.");

export async function requestSignInLink(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(str(fd, "email")?.trim().toLowerCase());
  if (!parsed.success) return { ok: false, reason: parsed.error.issues[0]?.message, fieldErrors: { email: parsed.error.issues[0]?.message ?? "" } };
  try {
    await auth.api.signInMagicLink({
      body: { email: parsed.data, callbackURL: "/", errorCallbackURL: "/login?error=link" },
      headers: await headers(),
    });
  } catch (e) {
    console.error("[auth] sign-in link failed", e);
    return { ok: false, reason: "We couldn't send the link right now. Try again in a minute." };
  }
  redirect(`/login/sent?email=${encodeURIComponent(parsed.data)}`);
}

export async function signOut(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
