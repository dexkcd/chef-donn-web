/**
 * The planner's answer format (shared by the Claude and fake drafters) and its mapping back to
 * real ids. No nullable fields — the API allows at most 16 union-typed parameters per schema;
 * a code of "none" marks an item to ignore.
 */
import { z } from "zod";
import { roundToHundredPesos, parsePeso } from "@/domain/money";
import { dropNoOps, type PlanItem, type PlanProposal } from "@/domain/plan";
import type { PlanContext } from "./types";

export const NO_CODE = "none";

export function codesFor(ctx: PlanContext) {
  return {
    categories: ctx.categories.map((_, i) => `C${i + 1}`),
    tasks: ctx.tasks.map((_, i) => `T${i + 1}`),
    lines: ctx.lines.map((_, i) => `L${i + 1}`),
  };
}

export function planSchemaFor(ctx: PlanContext) {
  const c = codesFor(ctx);
  return z.object({
    summary: z.string(),
    assumptions: z.array(z.string()),
    check: z.array(z.string()),
    task_estimates: z.array(z.object({ task_code: z.enum([...c.tasks, NO_CODE]), amount: z.string(), reason: z.string() })),
    line_changes: z.array(z.object({ line_code: z.enum([...c.lines, NO_CODE]), amount: z.string(), reason: z.string() })),
    new_lines: z.array(z.object({ category_code: z.enum([...c.categories, NO_CODE]), description: z.string(), amount: z.string(), reason: z.string() })),
  });
}

export type PlanOutput = z.output<ReturnType<typeof planSchemaFor>>;

const clip = (s: string, n: number) => s.trim().slice(0, n);
const indexOf = (code: string) => Number(code.slice(1)) - 1;

/** Model answer → proposal with real ids. Unknown codes and unreadable amounts are dropped and counted. */
export function toProposal(o: PlanOutput, ctx: PlanContext): PlanProposal {
  let dropped = 0;
  const amount = (s: string) => {
    const cents = parsePeso(s.trim());
    return cents === null ? null : roundToHundredPesos(cents);
  };
  const items: PlanItem[] = [];
  const seen = new Set<string>();

  for (const t of o.task_estimates) {
    const task = t.task_code === NO_CODE ? undefined : ctx.tasks[indexOf(t.task_code)];
    const cents = amount(t.amount);
    if (!task || cents === null || seen.has(`t:${task.id}`)) {
      dropped++;
      continue;
    }
    seen.add(`t:${task.id}`);
    items.push({ id: `t:${task.id}`, kind: "task", taskId: task.id, lineId: task.lineId, categoryId: task.categoryId, description: task.title, currentCents: task.currentCents, proposedCents: cents, reason: clip(t.reason, 300) });
  }
  for (const l of o.line_changes) {
    const line = l.line_code === NO_CODE ? undefined : ctx.lines[indexOf(l.line_code)];
    const cents = amount(l.amount);
    if (!line || cents === null || seen.has(`l:${line.id}`)) {
      dropped++;
      continue;
    }
    seen.add(`l:${line.id}`);
    items.push({ id: `l:${line.id}`, kind: "line", lineId: line.id, categoryId: line.categoryId, description: line.description, currentCents: line.plannedCents, proposedCents: cents, reason: clip(l.reason, 300) });
  }
  o.new_lines.forEach((n, i) => {
    const cat = n.category_code === NO_CODE ? undefined : ctx.categories[indexOf(n.category_code)];
    const cents = amount(n.amount);
    const description = clip(n.description, 120);
    if (!cat || cents === null || cents === 0 || description === "") {
      dropped++;
      return;
    }
    items.push({ id: `n:${i}`, kind: "new", categoryId: cat.id, description, currentCents: 0, proposedCents: cents, reason: clip(n.reason, 300) });
  });

  return {
    summary: clip(o.summary, 800),
    assumptions: o.assumptions.map((a) => clip(a, 300)).filter(Boolean).slice(0, 8),
    check: o.check.map((a) => clip(a, 300)).filter(Boolean).slice(0, 8),
    items: dropNoOps(items),
    dropped,
  };
}
