import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { ROLE_LABELS } from "@/domain/permissions";
import { loadProfile } from "@/server/services/budget-data";
import { requireMember } from "@/server/viewer";
import { BottomNav } from "@/ui/nav";
import { SyncIndicator } from "@/ui/sync";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const v = await requireMember();
  const profile = await loadProfile(db, v.principal.workspaceId);
  if (!profile.onboardedAt) {
    if (v.principal.actor.role === "owner" || v.principal.actor.role === "partner") redirect("/onboarding");
  }
  return (
    <div className="min-h-dvh pb-[96px]">
      <header className="sticky top-0 z-10 border-b-[3px] border-ink bg-green text-cream">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-2">
          <Link href="/" className="min-w-0">
            <div className="display truncate text-[20px]">{profile.name}</div>
            <div className="label truncate text-[12px] text-[#cfe3d8]">
              {profile.barangay}, {profile.municipalityName} · {ROLE_LABELS[v.principal.actor.role]}
            </div>
          </Link>
          <SyncIndicator />
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 py-4">{children}</main>
      <BottomNav />
    </div>
  );
}
