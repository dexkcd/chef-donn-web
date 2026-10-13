import type { Metadata, Route } from "next";
import Link from "next/link";
import { can, ROLE_LABELS } from "@/domain/permissions";
import { signOut } from "@/server/actions/auth";
import { requireMember } from "@/server/viewer";
import { ExportLinks } from "@/ui/download-link";
import { Button, Card, PageHeader } from "@/ui/kit";

export const metadata: Metadata = { title: "More" };

export default async function SettingsPage() {
  const v = await requireMember();
  const a = v.principal.actor;
  const items: { href: string; label: string; hint: string; show: boolean }[] = [
    { href: "/funding", label: "Funding", hint: "Your money, partners, loans — promised and received", show: true },
    { href: "/payments/upcoming", label: "Upcoming payments", hint: "Due in the next 30 days", show: true },
    { href: "/settings/profile", label: "Restaurant profile", hint: "Name, opening date, budget, contingency %", show: can(a.role, "profile.edit") },
    { href: "/settings/categories", label: "Budget categories", hint: "Rename, add or archive", show: can(a.role, "category.edit") },
    { href: "/settings/people", label: "People", hint: "Invite a partner, helper or bookkeeper", show: can(a.role, "members.manage") },
    { href: "/settings/api", label: "API keys & price hook", hint: "Trigger price searches from scripts or agents", show: can(a.role, "api_keys.manage") },
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="More" subtitle={`${a.name || a.email} · ${ROLE_LABELS[a.role]}`} />
      <Card className="!p-0">
        <ul className="divide-y-[1.5px] divide-line">
          {items
            .filter((i) => i.show)
            .map((i) => (
              <li key={i.href}>
                <Link href={i.href as Route} className="flex min-h-[64px] items-center justify-between gap-3 px-4 py-2">
                  <span>
                    <span className="block font-semibold">{i.label}</span>
                    <span className="text-[14px] text-muted">{i.hint}</span>
                  </span>
                  <span aria-hidden className="text-muted">
                    ›
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      </Card>
      {can(a.role, "export.csv") && (
        <Card>
          <div className="label mb-2 text-muted">For the bookkeeper</div>
          <ExportLinks />
        </Card>
      )}
      <form action={signOut}>
        <Button variant="secondary" block>
          Sign out
        </Button>
      </form>
    </div>
  );
}
