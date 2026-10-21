import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { task } from "@/db/schema";
import { manilaToday } from "@/domain/dates";
import { formatPeso } from "@/domain/money";
import { can } from "@/domain/permissions";
import { saveCategoryPlansAction } from "@/server/actions/budget";
import { budgetOverview } from "@/server/services/budget-data";
import { requireMember } from "@/server/viewer";
import { BudgetBar } from "@/ui/budget-bar";
import { ActionForm, MoneyField, Submit } from "@/ui/form";
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
  // How each roadmap line's amount was set, for its badge.
  const basis = new Map((await db.select({ id: task.id, basis: task.estimateBasis }).from(task).where(eq(task.workspaceId, v.principal.workspaceId))).map((t) => [t.id, t.basis]));
  const badgeFlags = (lineId: string) => {
    const src = c.lines.find((x) => x.line.id === lineId);
    const b = src && o.inputs.lines.find((x) => x.id === lineId)?.sourceId;
    const tb = b ? basis.get(b) : undefined;
    return { estimate: tb === "template_mid", aiEstimate: tb === "ai_plan" };
  };
  const canPlanLines = can(v.principal.actor.role, "line.edit") && c.category.kind !== "contingency";
  // Editing: a stable order, so rows don't jump after a save. Reading: biggest first.
  const lines = canPlanLines ? [...c.lines].sort((a, b) => a.line.description.localeCompare(b.line.description)) : [...c.lines].sort((a, b) => b.forecast - a.forecast);
  const canAdd = can(v.principal.actor.role, "line.create") && c.category.kind !== "contingency";
  const canPlan = canPlanLines;

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
      {o.plan.total !== null && (
        <p className="text-[15px] text-muted">
          Total you can spend <span className="num">{formatPeso(o.plan.total, { noCentavos: true })}</span>
          {" · "}
          {o.plan.over > 0 ? (
            <span className="font-semibold text-red">▲ over by <span className="num">{formatPeso(o.plan.over, { noCentavos: true })}</span></span>
          ) : (
            <>
              ○ not yet allocated <span className="num">{formatPeso(o.plan.unallocated, { noCentavos: true })}</span>
            </>
          )}
        </p>
      )}
      {lines.length === 0 ? (
        <EmptyState title="No lines in this category" action={canAdd ? <ButtonLink href={`/budget/new?category=${c.category.id}`}>Add a line</ButtonLink> : undefined} />
      ) : canPlan ? (
        <ActionForm action={saveCategoryPlansAction}>
          <input type="hidden" name="categoryId" value={c.category.id} />
          <ul className="flex flex-col gap-2">
            {lines.map((l) => (
              <li key={l.line.id} className="rounded-lg border-[1.5px] border-line bg-surface p-3">
                <Link href={`/budget/lines/${l.line.id}`} className="font-semibold underline decoration-line underline-offset-4 hover:decoration-ink">
                  {l.line.description}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <LineStatusBadges line={l} {...badgeFlags(l.line.id)} />
                </div>
                <div className="num mt-1 text-[13px] text-muted">
                  committed {formatShort(l.committed)} · paid {formatShort(l.paid)}
                </div>
                <div className="mt-2">
                  {l.line.closed ? (
                    <p className="text-[15px] text-muted">
                      ✓ Finished — plan <Money cents={l.planned} noCentavos />
                    </p>
                  ) : (
                    <MoneyField
                      name={`planned.${l.line.id}`}
                      label="Planned"
                      defaultCents={l.planned}
                      hint={l.line.sourceType === "task" ? "From the roadmap — saving changes the task's estimate." : undefined}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Submit>Save {c.category.name}</Submit>
        </ActionForm>
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
                  <LineStatusBadges line={l} {...badgeFlags(l.line.id)} />
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
