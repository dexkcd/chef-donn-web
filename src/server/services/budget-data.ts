/** Load the budget from the database into the pure domain shapes. */
import { and, eq, isNull } from "drizzle-orm";
import type { Executor } from "@/db/client";
import { budgetCategory, fundingSource, fundingTranche, moneyLine, payment, restaurantProfile } from "@/db/schema";
import { planVsTotal, rollupBudget, type CategoryInput, type LineInput, type PaymentInput } from "@/domain/budget";
import { cashPosition, runway, type FundingSourceInput, type FundingTrancheInput } from "@/domain/cash";
import type { LocalDate } from "@/domain/dates";
import { upcomingPayments } from "@/domain/upcoming";

export async function loadProfile(exec: Executor, workspaceId: string) {
  const [p] = await exec.select().from(restaurantProfile).where(eq(restaurantProfile.workspaceId, workspaceId));
  if (!p) throw new Error(`no profile for workspace ${workspaceId}`);
  return p;
}

export async function loadCategories(exec: Executor, workspaceId: string) {
  return exec.select().from(budgetCategory).where(eq(budgetCategory.workspaceId, workspaceId)).orderBy(budgetCategory.sort);
}

export async function loadBudgetInputs(exec: Executor, workspaceId: string) {
  const [cats, lines, pays, sources, tranches] = await Promise.all([
    loadCategories(exec, workspaceId),
    exec.select().from(moneyLine).where(and(eq(moneyLine.workspaceId, workspaceId), isNull(moneyLine.voidedAt))),
    exec.select().from(payment).where(and(eq(payment.workspaceId, workspaceId), isNull(payment.voidedAt))),
    exec.select().from(fundingSource).where(and(eq(fundingSource.workspaceId, workspaceId), isNull(fundingSource.archivedAt))),
    exec.select().from(fundingTranche).where(and(eq(fundingTranche.workspaceId, workspaceId), isNull(fundingTranche.voidedAt))),
  ]);
  const categories: CategoryInput[] = cats
    .filter((c) => c.archivedAt === null || lines.some((l) => l.categoryId === c.id))
    .map((c) => ({ id: c.id, key: c.key, name: c.name, kind: c.kind, sort: c.sort }));
  const lineInputs: LineInput[] = lines.map((l) => ({
    id: l.id,
    categoryId: l.categoryId,
    description: l.description,
    plannedCents: l.plannedCents,
    committedCents: l.committedCents,
    dueDate: l.dueDate,
    sourceType: l.sourceType,
    locked: l.locked,
    closed: l.closedAt !== null,
  }));
  const paymentInputs: PaymentInput[] = pays.map((p) => ({ id: p.id, moneyLineId: p.moneyLineId, amountCents: p.amountCents, paidOn: p.paidOn }));
  const fundingInputs: FundingSourceInput[] = sources.map((s) => ({
    id: s.id,
    type: s.type,
    name: s.name,
    committedCents: s.committedCents,
    expectedOn: s.expectedOn,
  }));
  const trancheInputs: FundingTrancheInput[] = tranches.map((t) => ({
    fundingSourceId: t.fundingSourceId,
    amountCents: t.amountCents,
    receivedOn: t.receivedOn,
  }));
  return { cats, lines, pays, sources, tranches, categories, lineInputs, paymentInputs, fundingInputs, trancheInputs };
}

/** Everything the Overview needs, computed by the domain layer. */
export async function budgetOverview(exec: Executor, workspaceId: string, today: LocalDate) {
  const [inputs, profile] = await Promise.all([loadBudgetInputs(exec, workspaceId), loadProfile(exec, workspaceId)]);
  const rollup = rollupBudget(inputs.categories, inputs.lineInputs, inputs.paymentInputs);
  const cash = cashPosition(inputs.fundingInputs, inputs.trancheInputs, rollup.totals.paid);
  return {
    profile,
    inputs,
    rollup,
    /** "Planned" fills to the total you can spend; the rest shows as not yet allocated. */
    plan: planVsTotal(rollup, profile.totalBudgetCents),
    cash,
    runway: runway(cash, rollup, today, profile.targetOpeningDate),
    upcoming14: upcomingPayments(rollup, today, 14),
    upcoming30: upcomingPayments(rollup, today, 30),
  };
}
export type BudgetOverview = Awaited<ReturnType<typeof budgetOverview>>;
