import type { Metadata } from "next";
import { requestSignInLink } from "@/server/actions/auth";
import { ActionForm, Submit, TextField } from "@/ui/form";
import { Notice } from "@/ui/kit";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="display text-[28px]">Sign in</h1>
      <p className="text-muted">We&rsquo;ll email you a link. No password to remember.</p>
      {error && <Notice tone="danger" title="That sign-in link didn't work">Links work once and expire after 15 minutes. Ask for a new one.</Notice>}
      <ActionForm action={requestSignInLink}>
        <TextField name="email" label="Email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" required />
        <Submit pendingLabel="Sending…">Email me a sign-in link</Submit>
      </ActionForm>
    </div>
  );
}
