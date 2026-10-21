import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describe, expect, it } from "vitest";
import { EMPTY_ANSWERS } from "@/domain/plan";
import { countUnionParams } from "../schema-limits";
import { FakePlanDrafter } from "./fake";
import { planSchemaFor, toProposal, type PlanOutput } from "./output";
import { planContextText } from "./prompt";
import type { PlanContext } from "./types";

const ctx = (lines = 2): PlanContext => ({
  restaurant: { name: "Kusina", concept: "Seafood grill", place: "Port Barton, San Vicente, Palawan", startingPoint: "building", targetOpeningDate: "2027-03-01", totalBudgetCents: 3_500_000_00, contingencyBp: 1200 },
  answers: { ...EMPTY_ANSWERS, seats: 40, space: "bare_shell", rentMonthlyCents: 25_000_00, depositMonths: 2, advanceMonths: 1, alreadyHave: ["generator"], notes: "Beach side" },
  categories: [
    { id: "cat-site", name: "Site", hint: null, kind: "normal" },
    { id: "cat-equip", name: "Equipment", hint: "Kitchen", kind: "normal" },
    { id: "cat-util", name: "Utilities setup", hint: null, kind: "normal" },
    { id: "cat-pay", name: "Pre-opening payroll and training", hint: null, kind: "normal" },
  ],
  tasks: [
    { id: "task-lease", title: "Sign and notarise the lease", stage: "build", status: "todo", categoryId: "cat-site", lineId: "line-lease", currentCents: 60_000_00, minCents: 30_000_00, maxCents: 90_000_00, basis: "template_mid" },
    { id: "task-kitchen", title: "Buy kitchen and refrigeration equipment", stage: "build", status: "todo", categoryId: "cat-equip", lineId: "line-kitchen", currentCents: 400_000_00, minCents: 250_000_00, maxCents: 550_000_00, basis: "template_mid" },
    { id: "task-gen", title: "Backup generator (if power is unreliable)", stage: "build", status: "todo", categoryId: "cat-equip", lineId: "line-gen", currentCents: 150_000_00, minCents: 100_000_00, maxCents: 200_000_00, basis: "template_mid" },
  ],
  lines: Array.from({ length: lines }, (_, i) => ({ id: `line-${i}`, categoryId: "cat-site", description: `Line ${i}`, plannedCents: 10_000_00, sourceType: "manual" })),
  today: "2026-10-21",
});

const sent = (c: PlanContext) => betaZodOutputFormat(planSchemaFor(c)).schema;

describe("plan output schema", () => {
  it("has no union-typed parameters (API limit is 16), with and without existing lines", () => {
    expect(countUnionParams(sent(ctx(2)))).toBe(0);
    expect(countUnionParams(sent(ctx(0)))).toBe(0);
  });
});

describe("toProposal", () => {
  const base: PlanOutput = { summary: " S ", assumptions: ["a", ""], check: ["c"], task_estimates: [], line_changes: [], new_lines: [] };

  it("maps codes back to ids, rounds to ₱100 and hides changes that change nothing", () => {
    const p = toProposal(
      {
        ...base,
        task_estimates: [
          { task_code: "T2", amount: "650,049.00", reason: "40 seats" },
          { task_code: "T1", amount: "60000.00", reason: "same as now" },
        ],
        line_changes: [{ line_code: "L2", amount: "12000", reason: "more" }],
        new_lines: [{ category_code: "C3", description: " Water tank & pump ", amount: "35000.00", reason: "no mains water" }],
      },
      ctx(),
    );
    expect(p.items).toEqual([
      { id: "t:task-kitchen", kind: "task", taskId: "task-kitchen", lineId: "line-kitchen", categoryId: "cat-equip", description: "Buy kitchen and refrigeration equipment", currentCents: 400_000_00, proposedCents: 650_000_00, reason: "40 seats" },
      { id: "l:line-1", kind: "line", lineId: "line-1", categoryId: "cat-site", description: "Line 1", currentCents: 10_000_00, proposedCents: 12_000_00, reason: "more" },
      { id: "n:0", kind: "new", categoryId: "cat-util", description: "Water tank & pump", currentCents: 0, proposedCents: 35_000_00, reason: "no mains water" },
    ]);
    expect(p).toMatchObject({ summary: "S", assumptions: ["a"], check: ["c"], dropped: 0 });
  });

  it("drops unknown codes, 'none', unreadable amounts, duplicates and empty new lines — and counts them", () => {
    const p = toProposal(
      {
        ...base,
        task_estimates: [
          { task_code: "none", amount: "1.00", reason: "" },
          { task_code: "T2", amount: "about 600k", reason: "" },
          { task_code: "T3", amount: "0.00", reason: "already owned" },
          { task_code: "T3", amount: "5.00", reason: "duplicate" },
        ],
        new_lines: [
          { category_code: "C1", description: "", amount: "100.00", reason: "" },
          { category_code: "C1", description: "Free", amount: "0", reason: "" },
        ],
      },
      ctx(),
    );
    expect(p.items.map((i) => [i.id, i.proposedCents])).toEqual([["t:task-gen", 0]]);
    expect(p.dropped).toBe(5);
  });
});

describe("planner prompt", () => {
  it("gives Claude the place, the owner's answers, and coded tasks, lines and categories", () => {
    const t = planContextText(ctx());
    expect(t).toContain("Port Barton, San Vicente, Palawan");
    expect(t).toContain("Seats: 40");
    expect(t).toContain("Already has: Generator");
    expect(t).toContain("T2: Buy kitchen and refrigeration equipment [C2; build; todo] now ₱400,000");
    expect(t).toContain("L1: Line 0 [C1] ₱10,000");
    expect(t).toContain("Beach side");
  });
});

describe("fake planner", () => {
  it("drafts deterministic test data through the same mapping", async () => {
    const r = await new FakePlanDrafter().draft(ctx(0));
    const byId = new Map(r.proposal.items.map((i) => [i.id, i.proposedCents]));
    expect(byId.get("t:task-kitchen")).toBe(650_000_00);
    expect(byId.get("t:task-gen")).toBe(0); // already owns a generator
    expect(byId.get("t:task-lease")).toBe(75_000_00); // 25k × (2 + 1)
    expect(r.proposal.items.filter((i) => i.kind === "new").map((i) => i.description)).toEqual(["Water tank & pump", "Uniforms & aprons"]);
  });
});
