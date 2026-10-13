import type { Metadata, Route } from "next";
import Link from "next/link";
import { db } from "@/db/client";
import { formatDate, manilaToday } from "@/domain/dates";
import { budgetOverview } from "@/server/services/budget-data";
import { requireMember } from "@/server/viewer";
import { Card, EmptyState, Money, PageHeader, SectionTitle } from "@/ui/kit";

export const metadata: Metadata = { title: "Upcoming payments" };

export default async function UpcomingPage() {
  const v = await requireMember();
  const o = await budgetOverview(db, v.principal.workspaceId, manilaToday(new Date()));
  const u = o.upcoming30;
  const catName = new Map(o.inputs.cats.map((c) => [c.id, c.name]));
  const row = (d: (typeof u.due)[number], overdue: boolean) => (
    <li key={d.lineId}>
      <Link href={`/budget/lines/${d.lineId}` as Route} className="flex min-h-[56px] items-center justify-between gap-3 py-2">
        <span className="min-w-0">
          <span className="block truncate font-semibold">{d.description}</span>
          <span className={`text-[14px] ${overdue ? "font-semibold text-red" : "text-muted"}`}>
            {overdue ? "▲ Overdue · " : ""}
            <span className="num">{formatDate(d.dueDate, { withYear: false })}</span> · {catName.get(d.categoryId)}
          </span>
        </span>
        <Money cents={d.outstanding} noCentavos className="font-semibold" />
      </Link>
    </li>
  );
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Upcoming payments" back={{ href: "/budget", label: "Budget" }} subtitle={`Next 30 days, until ${formatDate(u.windowEnd)}.`} />
      {u.overdue.length > 0 && (
        <Card strong>
          <SectionTitle action={<Money cents={u.totalOverdue} noCentavos className="font-semibold text-red" />}>Overdue</SectionTitle>
          <ul className="divide-y-[1.5px] divide-line">{u.overdue.map((d) => row(d, true))}</ul>
        </Card>
      )}
      <Card>
        <SectionTitle action={<Money cents={u.totalDue} noCentavos className="font-semibold" />}>Due</SectionTitle>
        {u.due.length === 0 ? (
          <EmptyState title="Nothing due in the next 30 days">Give lines a due date to see them here.</EmptyState>
        ) : (
          <ul className="divide-y-[1.5px] divide-line">{u.due.map((d) => row(d, false))}</ul>
        )}
      </Card>
    </div>
  );
}
