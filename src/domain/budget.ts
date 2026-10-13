/**
 * The opening budget: every peso moves planned → committed → paid (v1 spec §7).
 *
 * Definitions (per money line):
 *   paid       = Σ non-voided payments (never stored — one source of truth)
 *   committed  = max(committed entered, paid)   — you can't have paid more than you committed
 *   forecast   = closed ? paid : max(planned, committed)   — what this line will end up costing
 *   overBy     = max(0, forecast − planned)
 *   savedBy    = closed ? max(0, planned − paid) : 0   — only realised savings count
 *
 * A category's overspend (net of realised savings inside that category) is drawn from the
 * contingency category, and the dashboard always shows that draw — never silently.
 */
import type { LocalDate } from "./dates";
import { mulBp, ratioBp, sumCents, type BasisPoints, type Cents } from "./money";

export type CategoryKind = "normal" | "contingency" | "working_capital";

export type SourceType =
  | "manual"
  | "task"
  | "receipt_unplanned"
  | "contingency_rule"
  // Later modules plug in here without schema changes:
  | "contract"
  | "permit"
  | "equipment"
  | "location";

export interface CategoryInput {
  id: string;
  key: string;
  name: string;
  kind: CategoryKind;
  sort: number;
}

export interface LineInput {
  id: string;
  categoryId: string;
  description: string;
  plannedCents: Cents;
  committedCents: Cents;
  dueDate: LocalDate | null;
  sourceType: SourceType;
  locked: boolean;
  closed: boolean;
}

export interface PaymentInput {
  id: string;
  moneyLineId: string;
  amountCents: Cents;
  paidOn: LocalDate;
}

export interface LineRollup {
  line: LineInput;
  planned: Cents;
  committed: Cents;
  paid: Cents;
  forecast: Cents;
  overBy: Cents;
  savedBy: Cents;
  /** Still to pay on this line = forecast − paid. */
  outstanding: Cents;
}

export interface CategoryRollup {
  category: CategoryInput;
  lines: LineRollup[];
  planned: Cents;
  committed: Cents;
  paid: Cents;
  forecast: Cents;
  /** Net overspend after realised savings in the same category. */
  overBy: Cents;
  /** Net realised savings (when savings exceed overruns). */
  savedBy: Cents;
}

export interface ContingencySummary {
  planned: Cents;
  /** Overspend in other categories, drawn from contingency. */
  drawn: Cents;
  /** Realised savings returned to contingency. */
  released: Cents;
  /** Spending booked directly against the contingency category. */
  spentDirect: Cents;
  left: Cents;
  /** left as basis points of planned; null when nothing is planned. */
  leftBp: BasisPoints | null;
  exhausted: boolean;
  /** Which categories drew, largest first — so the dashboard can name them. */
  drawnBy: { categoryId: string; name: string; amount: Cents }[];
}

export interface BudgetRollup {
  categories: CategoryRollup[];
  totals: { planned: Cents; committed: Cents; paid: Cents; forecast: Cents };
  contingency: ContingencySummary;
  /** Lines that pay out of contingency/working capital are excluded from "still to pay". */
  stillToPay: Cents;
  lineById: Map<string, LineRollup>;
}

export function rollupLine(line: LineInput, payments: readonly PaymentInput[]): LineRollup {
  const paid = sumCents(payments.filter((p) => p.moneyLineId === line.id).map((p) => p.amountCents));
  return rollupLineWithPaid(line, paid);
}

function rollupLineWithPaid(line: LineInput, paid: Cents): LineRollup {
  const committed = Math.max(line.committedCents, paid);
  const forecast = line.closed ? paid : Math.max(line.plannedCents, committed);
  const overBy = Math.max(0, forecast - line.plannedCents);
  const savedBy = line.closed ? Math.max(0, line.plannedCents - paid) : 0;
  return {
    line,
    planned: line.plannedCents,
    committed,
    paid,
    forecast,
    overBy,
    savedBy,
    outstanding: Math.max(0, forecast - paid),
  };
}

export function rollupBudget(
  categories: readonly CategoryInput[],
  lines: readonly LineInput[],
  payments: readonly PaymentInput[],
): BudgetRollup {
  const paidByLine = new Map<string, Cents>();
  for (const p of payments) paidByLine.set(p.moneyLineId, (paidByLine.get(p.moneyLineId) ?? 0) + p.amountCents);

  const lineById = new Map<string, LineRollup>();
  const byCategory = new Map<string, LineRollup[]>();
  for (const line of lines) {
    const r = rollupLineWithPaid(line, paidByLine.get(line.id) ?? 0);
    lineById.set(line.id, r);
    const list = byCategory.get(line.categoryId) ?? [];
    list.push(r);
    byCategory.set(line.categoryId, list);
  }

  const sorted = [...categories].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const categoryRollups: CategoryRollup[] = sorted.map((category) => {
    const ls = byCategory.get(category.id) ?? [];
    const planned = sumCents(ls.map((l) => l.planned));
    const committed = sumCents(ls.map((l) => l.committed));
    const paid = sumCents(ls.map((l) => l.paid));
    const forecast = sumCents(ls.map((l) => l.forecast));
    const net = sumCents(ls.map((l) => l.overBy)) - sumCents(ls.map((l) => l.savedBy));
    return {
      category,
      lines: ls,
      planned,
      committed,
      paid,
      forecast,
      overBy: Math.max(0, net),
      savedBy: Math.max(0, -net),
    };
  });

  const contingency = summariseContingency(categoryRollups);
  const totals = {
    planned: sumCents(categoryRollups.map((c) => c.planned)),
    committed: sumCents(categoryRollups.map((c) => c.committed)),
    paid: sumCents(categoryRollups.map((c) => c.paid)),
    forecast: sumCents(categoryRollups.map((c) => (c.category.kind === "contingency" ? c.paid : c.forecast))),
  };
  const stillToPay = sumCents(
    categoryRollups.filter((c) => c.category.kind === "normal").flatMap((c) => c.lines.map((l) => l.outstanding)),
  );

  return { categories: categoryRollups, totals, contingency, stillToPay, lineById };
}

function summariseContingency(categories: readonly CategoryRollup[]): ContingencySummary {
  const pool = categories.filter((c) => c.category.kind === "contingency");
  const others = categories.filter((c) => c.category.kind === "normal");
  const planned = sumCents(pool.map((c) => c.planned));
  const spentDirect = sumCents(pool.map((c) => c.committed));
  const drawnBy = others
    .filter((c) => c.overBy > 0)
    .map((c) => ({ categoryId: c.category.id, name: c.category.name, amount: c.overBy }))
    .sort((a, b) => b.amount - a.amount);
  const drawn = sumCents(drawnBy.map((d) => d.amount));
  const released = sumCents(others.map((c) => c.savedBy));
  const left = planned + released - drawn - spentDirect;
  return {
    planned,
    drawn,
    released,
    spentDirect,
    left,
    leftBp: ratioBp(left, planned),
    exhausted: left < 0,
    drawnBy,
  };
}

/**
 * The contingency line's planned amount: a percentage of everything planned in normal
 * categories (working-capital reserve excluded — it's for after opening).
 */
export function contingencyTarget(
  categories: readonly CategoryInput[],
  lines: readonly LineInput[],
  contingencyBp: BasisPoints,
): Cents {
  const normal = new Set(categories.filter((c) => c.kind === "normal").map((c) => c.id));
  const base = sumCents(lines.filter((l) => normal.has(l.categoryId)).map((l) => l.plannedCents));
  return mulBp(base, contingencyBp);
}
