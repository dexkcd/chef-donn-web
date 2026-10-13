import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { manilaToday } from "@/domain/dates";
import { can } from "@/domain/permissions";
import { budgetOverview } from "@/server/services/budget-data";
import { requireMember } from "@/server/viewer";
import { BudgetBar } from "@/ui/budget-bar";
import { ButtonLink, Card, EmptyState, Money, PageHeader, StatusBadge } from "@/ui/kit";
import { LineStatusBadges } from "@/ui/line-badges";

export const metadata: Metadata = { title: "Category" };

export default async function CategoryPage({ params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  const v = await requireMember();
  const o = await budgetOverview(db, v.principal.workspaceId, manilaToday(new Date()));
  const c = o.rollup.categories.find((x) => x.category.id === categoryId);
  if (!c) notFound();
  const cat = o.inputs.cats.find((x) => x.id === categoryId)!;
  const lines = [...c.lines].sort((a, b) => b.forecast - a.forecast);
  const canAdd = can(v.principal.actor.role, "line.create") && c.category.kind !== "contingency";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={c.category.name}
        subtitle={cat.hint}
        back={{ href: "/budget", label: "Budget" }}
        action={canAdd ? <ButtonLink href={`/budget/new?category=${c.category.id}`} size="sm">＋ Line</ButtonLink> : undefined}
      />
      <Card>
        <BudgetBar name="This category" planned={c.planned} committed={c.committed} paid={c.paid} forecast={c.forecast} scaleMax={Math.max(c.planned, c.forecast)} />
        {c.overBy > 0 && <p className="mt-1 text-[15px] text-red">▲ {c.category.name} is over plan — the difference comes out of contingency.</p>}
      </Card>
      {lines.length === 0 ? (
        <EmptyState title="No lines in this category" action={canAdd ? <ButtonLink href={`/budget/new?category=${c.category.id}`}>Add a line</ButtonLink> : undefined} />
      ) : (
        <ul className="flex flex-col gap-2">
          {lines.map((l) => (
            <li key={l.line.id}>
              <Link href={`/budget/lines/${l.line.id}`} className="block rounded-lg border-[1.5px] border-line bg-surface p-3 hover:border-ink">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-semibold">{l.line.description}</span>
                  <Money cents={l.forecast} noCentavos className="font-semibold" />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <LineStatusBadges line={l} />
                </div>
                <div className="num mt-1 text-[13px] text-muted">
                  plan {formatShort(l.planned)} · committed {formatShort(l.committed)} · paid {formatShort(l.paid)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {c.category.kind === "contingency" && (
        <p className="text-muted">
          <StatusBadge tone="estimate" label="Automatic" /> The contingency line is a percentage of everything planned. Change it in Settings → Profile.
        </p>
      )}
    </div>
  );
}

function formatShort(c: number) {
  return `₱${Math.round(c / 100).toLocaleString("en-US")}`;
}
