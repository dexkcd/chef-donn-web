/**
 * Planned amounts for a whole category in one save. Each line keeps its own rules: a roadmap
 * line is changed through its task's estimate (the line follows the task), a manual or
 * receipt line is edited directly, contingency stays automatic. All or nothing — one
 * transaction, so a refused line leaves every other line as it was.
 */
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { budgetCategory, moneyLine, task } from "@/db/schema";
import { actorCan, Rejection, type ServiceCtx } from "../context";
import { updateLine } from "./budget";
import { setTaskEstimate } from "./roadmap";

const cents = z
  .number({ error: "Enter an amount in pesos, like 650,000 or 650k." })
  .int()
  .min(0, "Amounts can't be negative.")
  .max(9_000_000_000_000, "That amount is too large.");

export const categoryPlansInput = z.object({
  categoryId: z.uuid(),
  plans: z.array(z.object({ lineId: z.uuid(), plannedCents: cents })).max(500),
});

export async function setCategoryPlans(ctx: ServiceCtx, input: z.output<typeof categoryPlansInput>) {
  const [cat] = await ctx.tx
    .select()
    .from(budgetCategory)
    .where(and(eq(budgetCategory.id, input.categoryId), eq(budgetCategory.workspaceId, ctx.workspaceId)));
  if (!cat || cat.archivedAt) throw new Rejection("That category doesn't exist any more.", undefined, 404);
  if (cat.kind === "contingency") throw new Rejection("Contingency is calculated from your estimates — change the percentage in Profile.");

  let changed = 0;
  for (const p of input.plans) {
    const [line] = await ctx.tx
      .select()
      .from(moneyLine)
      .where(and(eq(moneyLine.id, p.lineId), eq(moneyLine.workspaceId, ctx.workspaceId), isNull(moneyLine.voidedAt)));
    const field = `planned.${p.lineId}`;
    if (!line || line.categoryId !== cat.id) throw new Rejection("A line on this page was moved or removed — reload and try again.", { [field]: "This line has changed." });
    if (line.plannedCents === p.plannedCents) continue;
    if (line.closedAt) throw new Rejection(`"${line.description}" is finished — reopen it to change its plan.`, { [field]: "Finished line." });

    if (line.sourceType === "task" && line.sourceId) {
      if (!actorCan(ctx.actor, "task.edit")) throw new Rejection("Your role can't change roadmap estimates.", undefined, 403);
      const [t] = await ctx.tx.select().from(task).where(and(eq(task.id, line.sourceId), eq(task.workspaceId, ctx.workspaceId)));
      if (!t) throw new Rejection(`"${line.description}" lost its roadmap task — edit it from the line page.`, { [field]: "No task." });
      if (t.status === "skipped") throw new Rejection(`"${t.title}" is skipped on the roadmap — un-skip it to give it an amount.`, { [field]: "Task skipped." });
      await setTaskEstimate(ctx, { taskId: t.id, estimateCents: p.plannedCents });
    } else if (line.locked) {
      throw new Rejection(`"${line.description}" is calculated automatically.`, { [field]: "Automatic." });
    } else {
      await updateLine(ctx, { lineId: line.id, plannedCents: p.plannedCents });
    }
    changed++;
  }
  return { changed };
}
