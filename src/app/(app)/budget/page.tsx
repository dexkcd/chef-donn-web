import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db/client";
import { manilaToday } from "@/domain/dates";
import { can } from "@/domain/permissions";
import { budgetOverview } from "@/server/services/budget-data";
import { requireMember } from "@/server/viewer";
import { ExportLinks } from "@/ui/download-link";
import { BudgetBar, BudgetBarLegend } from "@/ui/budget-bar";
import { ButtonLink, Card, KeyValue, Money, PageHeader, SectionTitle } from "@/ui/kit";

export const metadata: Metadata = { title: "Budget" };

export default async function BudgetPage() {
  const v = await requireMember();
  const role = v.principal.actor.role;
  const o = await budgetOverview(db, v.principal.workspaceId, manilaToday(new Date()));
  const cats = o.rollup.categories.filter((c) => c.category.kind !== "contingency");
  const scaleMax = Math.max(1, ...cats.map((c) => Math.max(c.planned, c.forecast)));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Budget"
        subtitle="Every peso moves from planned to committed to paid."
        action={can(role, "line.create") ? <ButtonLink href="/budget/new" size="sm">＋ Line</ButtonLink> : undefined}
      />
      <Card>
        <KeyValue
          items={[
            { k: "○ Planned", v: <Money cents={o.plan.planned} /> },
            ...(o.plan.unallocated > 0 ? [{ k: "Not yet allocated", v: <Money cents={o.plan.unallocated} /> }] : []),
            ...(o.plan.over > 0 ? [{ k: "▲ Over your total", v: <Money cents={o.plan.over} /> }] : []),
            { k: "● Committed", v: <Money cents={o.rollup.totals.committed} /> },
            { k: "✓ Paid", v: <Money cents={o.rollup.totals.paid} /> },
            { k: "Forecast to open", v: <Money cents={o.rollup.totals.forecast + Math.max(0, o.rollup.contingency.left)} /> },
          ]}
        />
      </Card>
      <div className="grid grid-cols-2 gap-2">
        <ButtonLink href="/payments/upcoming" variant="secondary" size="sm">
          Upcoming payments
        </ButtonLink>
        <ButtonLink href="/funding" variant="secondary" size="sm">
          Funding
        </ButtonLink>
      </div>
      <Card>
        <SectionTitle>Categories</SectionTitle>
        <BudgetBarLegend />
        <div className="mt-2 flex flex-col">
          {cats.map((c) => (
            <BudgetBar
              key={c.category.id}
              href={`/budget/${c.category.id}`}
              name={c.category.name}
              planned={c.planned}
              committed={c.committed}
              paid={c.paid}
              forecast={c.forecast}
              scaleMax={scaleMax}
            />
          ))}
        </div>
      </Card>
      <Card>
        <SectionTitle>Contingency</SectionTitle>
        <p className="text-[15px]">
          <Money cents={o.rollup.contingency.left} /> left of <Money cents={o.rollup.contingency.planned} />. Change the percentage in{" "}
          <Link className="font-semibold text-green underline" href="/settings/profile">
            Profile
          </Link>
          .
        </p>
      </Card>
      {can(role, "export.csv") && (
        <Card>
          <SectionTitle>For the bookkeeper</SectionTitle>
          <ExportLinks />
        </Card>
      )}
    </div>
  );
}
