import { describe, expect, it } from "vitest";
import type { CategoryInput, LineInput } from "./budget";
import { dropNoOps, EMPTY_ANSWERS, planAnswersSchema, planImpact, type PlanItem } from "./plan";

const cats: CategoryInput[] = [
  { id: "c-equip", key: "equipment", name: "Equipment", kind: "normal", sort: 1 },
  { id: "c-site", key: "site", name: "Site", kind: "normal", sort: 2 },
  { id: "c-cont", key: "contingency", name: "Contingency", kind: "contingency", sort: 90 },
  { id: "c-wc", key: "working_capital", name: "Working capital", kind: "working_capital", sort: 95 },
];
const line = (id: string, categoryId: string, plannedCents: number, sourceType: LineInput["sourceType"] = "task"): LineInput => ({
  id,
  categoryId,
  description: id,
  plannedCents,
  committedCents: 0,
  dueDate: null,
  sourceType,
  locked: sourceType === "task",
  closed: false,
});
const lines = [line("kitchen", "c-equip", 400_000_00), line("lease", "c-site", 60_000_00), line("reserve", "c-wc", 100_000_00), line("rule", "c-cont", 46_000_00, "contingency_rule")];

const items: PlanItem[] = [
  { id: "t:k", kind: "task", taskId: "k", lineId: "kitchen", categoryId: "c-equip", description: "Kitchen", currentCents: 400_000_00, proposedCents: 650_000_00, reason: "40 seats, bare shell" },
  { id: "t:gen", kind: "task", taskId: "gen", lineId: null, categoryId: "c-equip", description: "Generator", currentCents: 0, proposedCents: 0, reason: "Already owned" },
  { id: "n:0", kind: "new", categoryId: "c-site", description: "Water tank", currentCents: 0, proposedCents: 35_000_00, reason: "Port Barton water" },
];

describe("planImpact", () => {
  it("shows the totals before and after the ticked proposals, recomputing contingency", () => {
    const { before, after } = planImpact(cats, lines, items, new Set(["t:k", "n:0"]), 1_000_000_00, 1000);
    expect(before).toEqual({ estimates: 560_000_00, contingency: 46_000_00, unallocated: 394_000_00, over: 0 });
    // Normal categories after: 650k + 60k + 35k = 745k → contingency 74.5k; with the 100k reserve: 845k.
    expect(after).toEqual({ estimates: 845_000_00, contingency: 74_500_00, unallocated: 80_500_00, over: 0 });
  });

  it("only counts what's ticked, and reports going over the total", () => {
    expect(planImpact(cats, lines, items, new Set(), 1_000_000_00, 1000).after.estimates).toBe(560_000_00);
    expect(planImpact(cats, lines, items, new Set(["t:k", "n:0"]), 800_000_00, 1000).after).toMatchObject({ unallocated: 0, over: 119_500_00 });
  });

  it("without a total there is nothing unallocated or over", () => {
    expect(planImpact(cats, lines, items, new Set(["t:k"]), null, 1000).after).toMatchObject({ unallocated: 0, over: 0 });
  });
});

describe("dropNoOps", () => {
  it("hides proposals that change nothing", () => {
    expect(dropNoOps(items).map((i) => i.id)).toEqual(["t:k", "n:0"]);
  });
});

describe("planAnswersSchema", () => {
  it("accepts an empty form and trims the notes", () => {
    expect(planAnswersSchema.parse({ ...EMPTY_ANSWERS, notes: "  seafood grill  " }).notes).toBe("seafood grill");
  });
  it("refuses unknown equipment and over-long notes", () => {
    expect(planAnswersSchema.safeParse({ ...EMPTY_ANSWERS, alreadyHave: ["spaceship"] }).success).toBe(false);
    expect(planAnswersSchema.safeParse({ ...EMPTY_ANSWERS, notes: "x".repeat(2001) }).success).toBe(false);
  });
});
