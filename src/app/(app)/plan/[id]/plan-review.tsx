"use client";

import { useMemo, useState } from "react";
import type { CategoryInput, LineInput } from "@/domain/budget";
import { formatPeso } from "@/domain/money";
import { planImpact, type PlanItem } from "@/domain/plan";
import { applyPlanAction } from "@/server/actions/plan";
import { ActionForm, Submit } from "@/ui/form";
import { Card, cx, StatusBadge } from "@/ui/kit";

const KIND_LABEL: Record<PlanItem["kind"], string> = { task: "Roadmap task", line: "Existing line", new: "New line" };
const peso = (c: number) => formatPeso(c, { noCentavos: true });

/** Tick what to apply; the footer shows what the budget would look like. */
export function PlanReview({
  draftId,
  items,
  categories,
  lines,
  totalBudgetCents,
  contingencyBp,
}: {
  draftId: string;
  items: (PlanItem & { categoryName: string })[];
  categories: CategoryInput[];
  lines: LineInput[];
  totalBudgetCents: number | null;
  contingencyBp: number;
}) {
  const [selected, setSelected] = useState(() => new Set(items.map((i) => i.id)));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const groups = useMemo(() => {
    const m = new Map<string, typeof items>();
    for (const i of items) m.set(i.categoryName, [...(m.get(i.categoryName) ?? []), i]);
    return [...m.entries()];
  }, [items]);
  const { before, after } = planImpact(categories, lines, items, selected, totalBudgetCents, contingencyBp);
  const n = selected.size;

  return (
    <ActionForm action={applyPlanAction}>
      <input type="hidden" name="draftId" value={draftId} />
      <div className="flex items-center justify-between gap-3">
        <span className="label text-[14px] text-muted">
          {items.length} proposed {items.length === 1 ? "change" : "changes"}
        </span>
        <button type="button" className="label min-h-[56px] px-2 text-[14px] text-green underline" onClick={() => setSelected(n === items.length ? new Set() : new Set(items.map((i) => i.id)))}>
          {n === items.length ? "Untick all" : "Tick all"}
        </button>
      </div>
      {groups.map(([name, group]) => (
        <section key={name} className="flex flex-col gap-2">
          <h2 className="label text-[15px] text-ink-2">{name}</h2>
          {group.map((i) => (
            <label
              key={i.id}
              className={cx("flex cursor-pointer gap-3 rounded-lg border-[1.5px] bg-surface p-3", selected.has(i.id) ? "border-[3px] border-green" : "border-line")}
            >
              <input type="checkbox" name="item" value={i.id} checked={selected.has(i.id)} onChange={() => toggle(i.id)} className="mt-1 size-5 shrink-0 accent-[#0f4d3a]" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-start justify-between gap-x-3">
                  <span className="font-semibold">{i.description}</span>
                  <span className="num whitespace-nowrap">
                    <span className="text-muted">{i.kind === "new" ? "—" : peso(i.currentCents)}</span> → <span className="font-semibold">{peso(i.proposedCents)}</span>
                  </span>
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                  <StatusBadge tone={i.kind === "new" ? "planned" : "ai_estimate"} label={KIND_LABEL[i.kind]} />
                </span>
                {i.reason && <span className="mt-1 block text-[15px] text-muted">{i.reason}</span>}
              </span>
            </label>
          ))}
        </section>
      ))}
      <Card strong className="sticky bottom-[88px]">
        <dl className="flex flex-col gap-0.5 text-[15px]">
          {(
            [
              ["Estimates", before.estimates, after.estimates],
              ["Contingency", before.contingency, after.contingency],
            ] as const
          ).map(([k, b, a]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-muted">{k}</dt>
              <dd className="num">
                {peso(b)} → <span className="font-semibold">{peso(a)}</span>
              </dd>
            </div>
          ))}
          {totalBudgetCents !== null &&
            (after.over > 0 ? (
              <div className="flex justify-between gap-3 font-semibold text-red">
                <dt>▲ Over your total</dt>
                <dd className="num">{peso(after.over)}</dd>
              </div>
            ) : (
              <div className="flex justify-between gap-3">
                <dt>○ Not yet allocated</dt>
                <dd className="num">
                  {peso(before.unallocated)} → <span className="font-semibold">{peso(after.unallocated)}</span>
                </dd>
              </div>
            ))}
        </dl>
        <div className="mt-3">
          <Submit pendingLabel="Applying…">{`Apply ${n} ${n === 1 ? "change" : "changes"}`}</Submit>
        </div>
      </Card>
    </ActionForm>
  );
}
