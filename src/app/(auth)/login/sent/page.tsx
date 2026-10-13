import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/ui/kit";

export const metadata: Metadata = { title: "Check your email" };

export default async function SentPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="display text-[28px]">Check your email</h1>
      <Notice tone="success" title={email ? `If ${email} is invited, a link is on its way.` : "If that email is invited, a link is on its way."}>
        Open it on this phone. It works once and expires in 15 minutes.
      </Notice>
      <p className="text-muted">
        Not invited yet? Ask the owner to invite you from Settings → People.{" "}
        <Link href="/login" className="font-semibold text-green underline">
          Use a different email
        </Link>
      </p>
    </div>
  );
}
