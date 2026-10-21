/**
 * Deterministic drafts for tests and local demos, labelled as test data. Answers the same shape
 * Claude does (codes, decimal strings), so the code→id mapping is exercised too.
 */
import { codesFor, NO_CODE, toProposal, type PlanOutput } from "./output";
import { PLAN_PROMPT_VERSION } from "./prompt";
import type { PlanContext, PlanDraftResult, PlanDrafter } from "./types";

export class FakePlanDrafter implements PlanDrafter {
  readonly name = "fake";

  async draft(ctx: PlanContext): Promise<PlanDraftResult> {
    if (/\bexplode\b/i.test(ctx.answers.notes)) throw new Error("fake planner failure");
    const c = codesFor(ctx);
    const has = new Set(ctx.answers.alreadyHave);
    const task = (re: RegExp) => {
      const i = ctx.tasks.findIndex((t) => re.test(t.title));
      return i >= 0 ? c.tasks[i]! : NO_CODE;
    };
    const cat = (name: RegExp) => {
      const i = ctx.categories.findIndex((x) => name.test(x.name));
      return i >= 0 ? c.categories[i]! : NO_CODE;
    };
    const a = ctx.answers;
    const out: PlanOutput = {
      summary: "Test data from the fake planner.",
      assumptions: ["Test data — not a real estimate."],
      check: ["Get a quote for the kitchen equipment (test data)."],
      task_estimates: [
        { task_code: task(/kitchen and refrigeration/i), amount: has.has("chiller") ? "520000.00" : "650000.00", reason: "Test data: kitchen for the seats given." },
        { task_code: task(/^Backup generator \(/), amount: has.has("generator") ? "0.00" : "180000.00", reason: has.has("generator") ? "Already owned." : "Test data: 15 kVA set." },
        ...(a.rentMonthlyCents
          ? [{ task_code: task(/lease/i), amount: ((a.rentMonthlyCents * ((a.depositMonths ?? 2) + (a.advanceMonths ?? 1))) / 100).toFixed(2), reason: "Rent × deposit and advance months." }]
          : []),
      ],
      line_changes: ctx.lines.filter((l) => l.sourceType === "ai_plan" && /uniform/i.test(l.description)).map((l) => ({ line_code: c.lines[ctx.lines.indexOf(l)]!, amount: "15000.00", reason: "Test data: more staff." })),
      new_lines: [
        ...(has.has("water_tank") || ctx.lines.some((l) => /water tank/i.test(l.description)) ? [] : [{ category_code: cat(/utilities/i), description: "Water tank & pump", amount: "35000.00", reason: "Test data." }]),
        ...(ctx.lines.some((l) => /uniform/i.test(l.description)) ? [] : [{ category_code: cat(/payroll/i), description: "Uniforms & aprons", amount: "12000.00", reason: "Test data." }]),
      ],
    };
    return { provider: this.name, model: null, promptVersion: PLAN_PROMPT_VERSION, proposal: toProposal(out, ctx), raw: { fake: true } };
  }
}
