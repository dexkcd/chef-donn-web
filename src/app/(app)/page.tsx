import { and, eq, inArray, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db/client";
import { receipt } from "@/db/schema";
import { formatDate, manilaToday } from "@/domain/dates";
import { formatBp, formatPeso } from "@/domain/money";
import { can } from "@/domain/permissions";
import { planDraftingOn } from "@/lib/ai/plan";
import { nextUp } from "@/domain/roadmap";
import { budgetOverview } from "@/server/services/budget-data";
import { loadRoadmap } from "@/server/services/roadmap";
import { requireMember } from "@/server/viewer";
import { BudgetBar, BudgetBarLegend } from "@/ui/budget-bar";
import { ButtonLink, Card, EmptyState, Money, Notice, SectionTitle, StatusBadge } from "@/ui/kit";
import { SnapshotSaver } from "@/ui/snapshot-saver";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage() {
  const v = await requireMember();
  const ws = v.principal.workspaceId;
  const today = manilaToday(new Date());
  const o = await budgetOverview(db, ws, today);
  const roadmap = await loadRoadmap(db, ws, o.profile.startingPoint);
  const next = nextUp(roadmap.view, 3);
  const catchUpIds = new Set(roadmap.view.catchUp.map((t) => t.task.id));
  const [{ toReview }] = (await db
    .select({ toReview: sql<number>`count(*)::int` })
    .from(receipt)
    .where(and(eq(receipt.workspaceId, ws), inArray(receipt.status, ["uploaded", "extracting", "needs_review", "extraction_failed"])))) as [{ toReview: number }];

  const { totals, contingency } = o.rollup;
  const normal = o.rollup.categories.filter((c) => c.category.kind !== "contingency" && (c.planned > 0 || c.committed > 0));
  const scaleMax = Math.max(1, ...normal.map((c) => Math.max(c.planned, c.forecast)));
  const due = [...o.upcoming14.overdue, ...o.upcoming14.due];
  const canWrite = v.principal.actor.role !== "bookkeeper";
  const canEditProfile = can(v.principal.actor.role, "profile.edit");
  const plan = o.plan;
  const canAiPlan = can(v.principal.actor.role, "plan.draft") && planDraftingOn();

  return (
    <div className="flex flex-col gap-5">
      <SnapshotSaver
        snapshot={{
          asOf: new Date().toISOString(),
          restaurant: o.profile.name,
          planned: plan.planned,
          committed: totals.committed,
          paid: totals.paid,
          cashOnHand: o.cash.cashOnHand,
          contingencyLeft: contingency.left,
          contingencyPlanned: contingency.planned,
          stillToPay: o.runway.stillToPay,
          due: due.map((d) => ({ description: d.description, dueDate: d.dueDate, outstanding: d.outstanding, overdue: d.daysFromToday < 0 })),
          nextUp: next.map((n) => ({ title: n.task.title, state: n.state.kind })),
        }}
      />

      {/* 1 · Cash left — the hero */}
      <Card strong>
        <div className="label text-[13px] text-muted">Cash on hand</div>
        <div className={`num text-[44px] font-semibold leading-none ${o.cash.cashOnHand < 0 ? "text-red" : ""}`}>{formatPeso(o.cash.cashOnHand, { noCentavos: true })}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[15px]">
          {o.runway.status === "covered" && <StatusBadge tone="ok" label="Covers what's left to pay" />}
          {o.runway.status === "covered_if_funding_arrives" && <StatusBadge tone="committed" label="Covered once funding arrives" />}
          {o.runway.status === "short" && <StatusBadge tone="over" label={`Short by ${formatPeso(-o.runway.gap, { noCentavos: true })}`} />}
          <span className="text-muted">
            <Money cents={o.runway.stillToPay} noCentavos /> still to pay
            {o.runway.daysToOpening !== null && <> · {o.runway.daysToOpening >= 0 ? `${o.runway.daysToOpening} days to opening` : "opening date passed"}</>}
          </span>
        </div>
        {o.cash.committed === 0 && canWrite && (
          <p className="mt-2 text-[14px] text-muted">
            Add where the money comes from in{" "}
            <Link className="font-semibold text-green underline" href="/funding">
              Funding
            </Link>{" "}
            to see cash on hand.
          </p>
        )}
      </Card>

      {/* 2 · Planned / committed / paid */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { tone: "planned" as const, v: plan.planned },
          { tone: "committed" as const, v: totals.committed },
          { tone: "paid" as const, v: totals.paid },
        ].map((k) => (
          <Card key={k.tone} className="!p-3">
            <StatusBadge tone={k.tone} />
            <div className="num mt-2 text-[17px] font-semibold leading-tight">{formatPeso(k.v, { noCentavos: true })}</div>
          </Card>
        ))}
      </div>
      <Card className="!py-3">
        {plan.total !== null ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="label text-[13px] text-muted">Total you can spend</div>
                <div className="num text-[20px] font-semibold">{formatPeso(plan.total, { noCentavos: true })}</div>
              </div>
              {canEditProfile && (
                <Link href="/settings/profile" className="label flex min-h-[56px] items-center px-2 text-[14px] text-green underline">
                  Edit
                </Link>
              )}
            </div>
            <dl className="mt-1 flex flex-col gap-0.5 text-[15px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Estimates</dt>
                <dd className="num">{formatPeso(plan.estimates, { noCentavos: true })}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Contingency ({formatBp(o.profile.contingencyBp)})</dt>
                <dd className="num">{formatPeso(plan.contingency, { noCentavos: true })}</dd>
              </div>
              {plan.over > 0 ? (
                <div className="flex justify-between gap-3 font-semibold text-red">
                  <dt>▲ Over your total</dt>
                  <dd className="num">{formatPeso(plan.over, { noCentavos: true })}</dd>
                </div>
              ) : (
                <div className="flex justify-between gap-3">
                  <dt>○ Not yet allocated</dt>
                  <dd className="num">{formatPeso(plan.unallocated, { noCentavos: true })}</dd>
                </div>
              )}
            </dl>
          </>
        ) : canEditProfile ? (
          <Link href="/settings/profile" className="flex min-h-[56px] items-center font-semibold text-green underline">
            Set the most you can spend →
          </Link>
        ) : (
          <span className="text-muted">No total budget set yet.</span>
        )}
        {canAiPlan && (
          <Link href="/plan/new" className="label mt-1 flex min-h-[56px] items-center text-[14px] text-green underline">
            Redo the AI setup — Claude redrafts every line →
          </Link>
        )}
      </Card>
      {plan.total !== null && plan.over > 0 && (
        <Notice tone="warning" title={`The plan is ${formatPeso(plan.over, { noCentavos: true })} over your total budget`}>
          You set {formatPeso(plan.total, { noCentavos: true })} as the most you can spend. Trim estimates or add funding.
        </Notice>
      )}

      {/* 3 · Contingency */}
      <Card>
        <SectionTitle action={<span className="num text-[14px] text-muted">{formatBp(o.profile.contingencyBp)} of estimates</span>}>Contingency left</SectionTitle>
        <div className={`num text-[24px] font-semibold ${contingency.exhausted ? "text-red" : ""}`}>
          {formatPeso(contingency.left, { noCentavos: true })}
          <span className="text-[15px] font-normal text-muted"> of {formatPeso(contingency.planned, { noCentavos: true })}</span>
        </div>
        <div className="mt-2 h-[12px] w-full rounded-r-[4px] bg-[#e6f3ec]" aria-hidden>
          <div
            className={`h-full rounded-r-[4px] ${contingency.exhausted ? "bg-red" : (contingency.leftBp ?? 10000) < 3000 ? "bg-gold" : "bg-green-bright"}`}
            style={{ width: `${Math.max(0, Math.min(100, (contingency.leftBp ?? 0) / 100))}%` }}
          />
        </div>
        {contingency.drawnBy.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1 text-[15px]">
            {contingency.drawnBy.map((d) => (
              <li key={d.categoryId} className="flex justify-between gap-3">
                <span>
                  <span className="text-red" aria-hidden>
                    ▲{" "}
                  </span>
                  {d.name} went over
                </span>
                <span className="num">−{formatPeso(d.amount, { noCentavos: true })}</span>
              </li>
            ))}
            {contingency.released > 0 && (
              <li className="flex justify-between gap-3 text-muted">
                <span>✓ Saved on finished lines</span>
                <span className="num">+{formatPeso(contingency.released, { noCentavos: true })}</span>
              </li>
            )}
          </ul>
        ) : (
          <p className="mt-2 text-[14px] text-muted">Nothing has gone over plan yet.</p>
        )}
      </Card>

      {/* 4 · Due in the next 14 days */}
      <Card>
        <SectionTitle
          action={
            <Link href="/payments/upcoming" className="label text-[13px] text-green">
              Next 30 days ›
            </Link>
          }
        >
          Due in the next 14 days
        </SectionTitle>
        {due.length === 0 ? (
          <p className="text-muted">Nothing due. Lines with a due date show up here.</p>
        ) : (
          <ul className="divide-y-[1.5px] divide-line">
            {due.map((d) => (
              <li key={d.lineId}>
                <Link href={`/budget/lines/${d.lineId}`} className="flex min-h-[56px] items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{d.description}</span>
                    <span className={`text-[14px] ${d.daysFromToday < 0 ? "font-semibold text-red" : "text-muted"}`}>
                      {d.daysFromToday < 0 ? `▲ Overdue · was due ${formatDate(d.dueDate, { withYear: false })}` : d.daysFromToday === 0 ? "Due today" : `Due ${formatDate(d.dueDate, { withYear: false })}`}
                    </span>
                  </span>
                  <Money cents={d.outstanding} noCentavos className="font-semibold" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 5 · Receipts + what's next */}
      {toReview > 0 && (
        <Link href="/receipts" className="block">
          <Notice tone="warning" title={`${toReview} receipt${toReview === 1 ? "" : "s"} to review`}>
            Confirm what the AI read so the payments count.
          </Notice>
        </Link>
      )}
      {canWrite && (
        <ButtonLink href="/receipts/capture" size="lg" block>
          ＋ Add a receipt
        </ButtonLink>
      )}

      <Card>
        <SectionTitle
          action={
            <Link href="/roadmap" className="label text-[13px] text-green">
              Roadmap ›
            </Link>
          }
        >
          What&rsquo;s next
        </SectionTitle>
        {roadmap.view.catchUp.length > 0 && (
          <p className="mb-2 text-[14px] text-muted">
            {roadmap.view.catchUp.length} earlier step{roadmap.view.catchUp.length === 1 ? " isn't" : "s aren't"} ticked off yet. Mark what&rsquo;s already done so later steps unblock.
          </p>
        )}
        {next.length === 0 ? (
          <p className="text-muted">Nothing you can start right now — everything left is waiting on something.</p>
        ) : (
          <ul className="divide-y-[1.5px] divide-line">
            {next.map((t) => (
              <li key={t.task.id}>
                <Link href={`/roadmap/${t.task.id}`} className="flex min-h-[56px] items-center justify-between gap-3 py-2">
                  <span className="font-semibold">{t.task.title}</span>
                  {catchUpIds.has(t.task.id) && t.state.kind === "available" ? (
                    <StatusBadge tone="unverified" label="Done already?" />
                  ) : (
                    <StatusBadge tone={t.state.kind === "in_progress" ? "in_progress" : "available"} />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 6 · Where the money goes */}
      <Card>
        <SectionTitle
          action={
            <Link href="/budget" className="label text-[13px] text-green">
              Budget ›
            </Link>
          }
        >
          By category
        </SectionTitle>
        {normal.length === 0 ? (
          <EmptyState title="No budget lines yet">Lines appear when you set up the roadmap or add them in Budget.</EmptyState>
        ) : (
          <>
            <BudgetBarLegend />
            <div className="mt-2 flex flex-col">
              {normal.map((c) => (
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
          </>
        )}
      </Card>
    </div>
  );
}
