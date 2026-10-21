/**
 * AI-drafted budget plans. Claude *proposes* amounts from the owner's answers; a person picks
 * which proposals to apply. Nothing here changes the budget — it describes proposals and what
 * applying a selection would do to the totals.
 */
import { z } from "zod";
import { contingencyTarget, type CategoryInput, type LineInput } from "./budget";
import { sumCents, type BasisPoints, type Cents } from "./money";

export const SPACE_STATUSES = ["bare_shell", "ex_restaurant", "other_fit_out", "no_space_yet"] as const;
export type SpaceStatus = (typeof SPACE_STATUSES)[number];
export const SPACE_LABELS: Record<SpaceStatus, string> = {
  bare_shell: "Bare shell — needs a kitchen built",
  ex_restaurant: "Former restaurant or café",
  other_fit_out: "Fitted out for something else",
  no_space_yet: "No space yet",
};

export const OWNED_ITEMS = ["generator", "water_tank", "chiller", "freezer", "range", "hood", "pos_hardware", "furniture", "aircon", "signage"] as const;
export type OwnedItem = (typeof OWNED_ITEMS)[number];
export const OWNED_LABELS: Record<OwnedItem, string> = {
  generator: "Generator",
  water_tank: "Water tank & pump",
  chiller: "Chiller / fridge",
  freezer: "Freezer",
  range: "Range / burners",
  hood: "Hood & exhaust",
  pos_hardware: "POS hardware",
  furniture: "Tables & chairs",
  aircon: "Aircon",
  signage: "Signage",
};

const optInt = (max: number) => z.number().int().min(0).max(max).nullable();

/** What the owner tells the planner. Everything is optional except the free text being a string. */
export const planAnswersSchema = z.object({
  seats: optInt(2000),
  space: z.enum(SPACE_STATUSES).nullable(),
  rentMonthlyCents: z.number().int().min(0).max(9_000_000_000_000).nullable(),
  depositMonths: optInt(24),
  advanceMonths: optInt(24),
  alreadyHave: z.array(z.enum(OWNED_ITEMS)).max(OWNED_ITEMS.length),
  staffAtOpening: optInt(500),
  notes: z.string().trim().max(2000, "Keep it under 2,000 characters."),
});
export type PlanAnswers = z.output<typeof planAnswersSchema>;

export const EMPTY_ANSWERS: PlanAnswers = {
  seats: null,
  space: null,
  rentMonthlyCents: null,
  depositMonths: null,
  advanceMonths: null,
  alreadyHave: [],
  staffAtOpening: null,
  notes: "",
};

/** One proposed change. `id` is stable within a draft: t:<taskId>, l:<lineId>, n:<index>. */
export type PlanItem =
  | { id: string; kind: "task"; taskId: string; lineId: string | null; categoryId: string | null; description: string; currentCents: Cents; proposedCents: Cents; reason: string }
  | { id: string; kind: "line"; lineId: string; categoryId: string; description: string; currentCents: Cents; proposedCents: Cents; reason: string }
  | { id: string; kind: "new"; categoryId: string; description: string; currentCents: 0; proposedCents: Cents; reason: string };

export interface PlanProposal {
  summary: string;
  assumptions: string[];
  check: string[];
  items: PlanItem[];
  /** Proposals the model made that didn't map to a real task/line/category or amount. */
  dropped: number;
}

/** Changes that change nothing are noise on the review screen. */
export function dropNoOps(items: readonly PlanItem[]): PlanItem[] {
  return items.filter((i) => (i.kind === "new" ? i.proposedCents > 0 : i.proposedCents !== i.currentCents));
}

export interface PlanTotals {
  /** Planned on normal and working-capital lines. */
  estimates: Cents;
  contingency: Cents;
  unallocated: Cents;
  over: Cents;
}

/**
 * The plan's totals now and after applying `selected` proposals. Contingency is recomputed the
 * way the budget does it (a percentage of normal-category estimates).
 */
export function planImpact(
  categories: readonly CategoryInput[],
  lines: readonly LineInput[],
  items: readonly PlanItem[],
  selected: ReadonlySet<string>,
  totalBudgetCents: Cents | null,
  contingencyBp: BasisPoints,
): { before: PlanTotals; after: PlanTotals } {
  const kindOf = new Map(categories.map((c) => [c.id, c.kind]));
  const base = lines.filter((l) => l.sourceType !== "contingency_rule" && kindOf.get(l.categoryId) !== "contingency");

  const planned = new Map(base.map((l) => [l.id, l.plannedCents]));
  const extra: LineInput[] = [];
  for (const i of items) {
    if (!selected.has(i.id)) continue;
    if (i.kind !== "new" && i.lineId && planned.has(i.lineId)) planned.set(i.lineId, i.proposedCents);
    else if (i.categoryId) extra.push({ id: i.id, categoryId: i.categoryId, description: i.description, plannedCents: i.proposedCents, committedCents: 0, dueDate: null, sourceType: "ai_plan", locked: false, closed: false });
  }
  const after = [...base.map((l) => ({ ...l, plannedCents: planned.get(l.id) ?? l.plannedCents })), ...extra];

  const totals = (ls: readonly LineInput[]): PlanTotals => {
    const estimates = sumCents(ls.map((l) => l.plannedCents));
    const contingency = contingencyTarget(categories, ls, contingencyBp);
    const allocated = estimates + contingency;
    return {
      estimates,
      contingency,
      unallocated: totalBudgetCents === null ? 0 : Math.max(0, totalBudgetCents - allocated),
      over: totalBudgetCents === null ? 0 : Math.max(0, allocated - totalBudgetCents),
    };
  };
  return { before: totals(base), after: totals(after) };
}
