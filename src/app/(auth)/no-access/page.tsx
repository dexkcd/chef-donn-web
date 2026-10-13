import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut } from "@/server/actions/auth";
import { getViewer } from "@/server/viewer";
import { Button, Notice } from "@/ui/kit";

export const metadata: Metadata = { title: "No access" };

export default async function NoAccessPage() {
  const v = await getViewer();
  if (v.status === "member") redirect("/");
  if (v.status === "anonymous") redirect("/login");
  return (
    <div className="flex flex-col gap-4">
      <h1 className="display text-[28px]">You&rsquo;re signed in, but not invited</h1>
      <Notice tone="warning" title={`${v.email} isn't part of a restaurant yet.`}>
        Ask the owner to invite this email address from Settings → People, then sign in again.
      </Notice>
      <form action={signOut}>
        <Button variant="secondary" block>
          Sign out
        </Button>
      </form>
    </div>
  );
}
