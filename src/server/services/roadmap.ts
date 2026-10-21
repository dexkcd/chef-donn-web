/**
 * Roadmap: onboarding copies the templates for this municipality into tasks; a task's
 * estimate drives a LOCKED planned budget line (edit the task, the line follows).
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db/client";
import { budgetCategory, moneyLine, restaurantProfile, task, taskDependency, taskTemplate } from "@/db/schema";
import { templatesFor } from "@/db/seed/roadmap";
import { isLocalDate } from "@/domain/dates";
import { roundToHundredPesos } from "@/domain/money";
import { roadmapView, STARTING_POINTS, type StartingPoint, type TaskNode } from "@/domain/roadmap";
import { Rejection, type ServiceCtx } from "../context";
import { syncContingencyLine } from "./budget";

export const onboardInput = z.object({
  name: z.string().trim().min(1, "Give the restaurant a name.").max(120),
  concept: z.string().trim().max(500).optional(),
  startingPoint: z.enum(STARTING_POINTS),
  targetOpeningDate: z.string().refine(isLocalDate, "Pick a date.").nullable().optional(),
  totalBudgetCents: z.number({ error: "Enter an amount in pesos, like 2,500,000 or 2.5m." }).int().min(0).nullable().optional(),
  contingencyBp: z.number().int().min(0).max(5000).default(1200),
});

export const taskStatusInput = z.object({
  clientId: z.uuid().optional(),
  taskId: z.uuid(),
  status: z.enum(["todo", "in_progress", "done", "skipped"]),
});

export const taskEstimateInput = z.object({
  taskId: z.uuid(),
  estimateCents: z.number().int().min(0).max(9_000_000_000_000),
  categoryKey: z.string().optional(),
  priceSearchId: z.uuid().optional(),
});

/** Copy this municipality's templates into tasks (idempotent — new templates are added later). */
export async function instantiateTasks(ctx: ServiceCtx, municipalityCode: string) {
  const templates = templatesFor(municipalityCode);
  const dbTemplates = await ctx.tx.select({ key: taskTemplate.key }).from(taskTemplate);
  const known = new Set(dbTemplates.map((t) => t.key));
  const missing = templates.filter((t) => !known.has(t.key));
  if (missing.length > 0) throw new Error(`templates not synced: ${missing.map((t) => t.key).join(", ")}`);

  const existing = await ctx.tx
    .select({ id: task.id, templateKey: task.templateKey })
    .from(task)
    .where(eq(task.workspaceId, ctx.workspaceId));
  const byKey = new Map(existing.filter((t) => t.templateKey).map((t) => [t.templateKey!, t.id]));

  const toCreate = templates.filter((t) => !byKey.has(t.key));
  if (toCreate.length > 0) {
    const inserted = await ctx.tx
      .insert(task)
      .values(
        toCreate.map((t) => {
          const mid = t.costMinCents !== null && t.costMaxCents !== null ? roundToHundredPesos(Math.round((t.costMinCents + t.costMaxCents) / 2)) : null;
          return {
            workspaceId: ctx.workspaceId,
            templateKey: t.key,
            stage: t.stage,
            area: t.area,
            sort: t.sort,
            title: t.title,
            body: t.body,
            costMinCents: t.costMinCents,
            costMaxCents: t.costMaxCents,
            categoryKey: t.categoryKey,
            estimateCents: mid,
            estimateBasis: mid !== null ? ("template_mid" as const) : null,
            verification: t.verification,
            source: t.source,
          };
        }),
      )
      .returning({ id: task.id, templateKey: task.templateKey });
    for (const r of inserted) byKey.set(r.templateKey!, r.id);
  }

  const deps = templates.flatMap((t) =>
    t.dependsOn
      .map((d) => ({ taskId: byKey.get(t.key)!, dependsOnTaskId: byKey.get(d) }))
      .filter((d): d is { taskId: string; dependsOnTaskId: string } => d.dependsOnTaskId !== undefined),
  );
  if (deps.length > 0) await ctx.tx.insert(taskDependency).values(deps).onConflictDoNothing();

  const created = await ctx.tx.select().from(task).where(eq(task.workspaceId, ctx.workspaceId));
  for (const t of created) await syncTaskLine(ctx, t);
  return created.length;
}

/** The task's locked budget line follows the task: planned = estimate, or 0 when skipped. */
export async function syncTaskLine(ctx: ServiceCtx, t: typeof task.$inferSelect) {
  const [line] = await ctx.tx
    .select()
    .from(moneyLine)
    .where(and(eq(moneyLine.workspaceId, ctx.workspaceId), eq(moneyLine.sourceType, "task"), eq(moneyLine.sourceId, t.id), isNull(moneyLine.voidedAt)));
  const planned = t.status === "skipped" ? 0 : (t.estimateCents ?? 0);
  if (line) {
    if (line.plannedCents !== planned || line.description !== t.title) {
      await ctx.tx.update(moneyLine).set({ plannedCents: planned, description: t.title }).where(eq(moneyLine.id, line.id));
    }
    return;
  }
  if (planned === 0 || !t.categoryKey) return;
  const [cat] = await ctx.tx
    .select()
    .from(budgetCategory)
    .where(and(eq(budgetCategory.workspaceId, ctx.workspaceId), eq(budgetCategory.key, t.categoryKey)));
  if (!cat) return;
  await ctx.tx.insert(moneyLine).values({
    workspaceId: ctx.workspaceId,
    categoryId: cat.id,
    description: t.title,
    plannedCents: planned,
    sourceType: "task",
    sourceId: t.id,
    locked: true,
  });
}

export async function onboard(ctx: ServiceCtx, input: z.output<typeof onboardInput>) {
  const [profile] = await ctx.tx
    .update(restaurantProfile)
    .set({
      name: input.name,
      concept: input.concept || null,
      startingPoint: input.startingPoint,
      targetOpeningDate: input.targetOpeningDate ?? null,
      totalBudgetCents: input.totalBudgetCents ?? null,
      contingencyBp: input.contingencyBp,
      onboardedAt: ctx.now,
    })
    .where(eq(restaurantProfile.workspaceId, ctx.workspaceId))
    .returning();
  if (!profile) throw new Error("profile missing");
  const n = await instantiateTasks(ctx, profile.municipalityCode);
  await syncContingencyLine(ctx);
  await ctx.audit({ action: "workspace.onboard", subjectType: "restaurant_profile", subjectId: ctx.workspaceId, after: { ...input, tasks: n } });
  return { tasks: n };
}

async function getTask(ctx: ServiceCtx, taskId: string) {
  const [t] = await ctx.tx
    .select()
    .from(task)
    .where(and(eq(task.id, taskId), eq(task.workspaceId, ctx.workspaceId)))
    .for("update");
  if (!t) throw new Rejection("That task doesn't exist.", undefined, 404);
  return t;
}

export async function setTaskStatus(ctx: ServiceCtx, input: z.output<typeof taskStatusInput>) {
  const t = await getTask(ctx, input.taskId);
  const [after] = await ctx.tx
    .update(task)
    .set({ status: input.status, completedAt: input.status === "done" ? ctx.now : null })
    .where(eq(task.id, t.id))
    .returning();
  await syncTaskLine(ctx, after!);
  if ((t.status === "skipped") !== (after!.status === "skipped")) await syncContingencyLine(ctx);
  await ctx.audit({ action: "task.set_status", subjectType: "task", subjectId: t.id, before: { status: t.status }, after: { status: input.status } });
  return after!;
}

/** `opts.basis` is internal: an AI-drafted plan a person applied (see services/ai-plan). */
export async function setTaskEstimate(ctx: ServiceCtx, input: z.output<typeof taskEstimateInput>, opts: { basis?: "ai_plan" } = {}) {
  const t = await getTask(ctx, input.taskId);
  const categoryKey = input.categoryKey ?? t.categoryKey;
  if (input.estimateCents > 0 && !categoryKey) throw new Rejection("Pick which budget category this cost belongs to.", { categoryKey: "Pick a category." });
  const [after] = await ctx.tx
    .update(task)
    .set({
      estimateCents: input.estimateCents,
      estimateBasis: opts.basis ?? (input.priceSearchId ? "price_search" : "owner"),
      estimatePriceSearchId: input.priceSearchId ?? null,
      categoryKey: categoryKey ?? null,
    })
    .where(eq(task.id, t.id))
    .returning();
  if (categoryKey && categoryKey !== t.categoryKey) {
    const [cat] = await ctx.tx
      .select()
      .from(budgetCategory)
      .where(and(eq(budgetCategory.workspaceId, ctx.workspaceId), eq(budgetCategory.key, categoryKey)));
    if (!cat) throw new Rejection("That category doesn't exist.");
    await ctx.tx
      .update(moneyLine)
      .set({ categoryId: cat.id })
      .where(and(eq(moneyLine.sourceType, "task"), eq(moneyLine.sourceId, t.id), isNull(moneyLine.voidedAt)));
  }
  await syncTaskLine(ctx, after!);
  await syncContingencyLine(ctx);
  await ctx.audit({
    action: "task.edit_estimate",
    subjectType: "task",
    subjectId: t.id,
    before: { estimateCents: t.estimateCents, basis: t.estimateBasis },
    after: { estimateCents: input.estimateCents, basis: after!.estimateBasis, priceSearchId: input.priceSearchId ?? null },
  });
  return after!;
}

// ── reads ─────────────────────────────────────────────────────────────────────────────────
export async function loadRoadmap(exec: Executor, workspaceId: string, startingPoint: StartingPoint) {
  const tasks = await exec.select().from(task).where(eq(task.workspaceId, workspaceId));
  const ids = tasks.map((t) => t.id);
  const deps = ids.length > 0 ? await exec.select().from(taskDependency).where(inArray(taskDependency.taskId, ids)) : [];
  const nodes: TaskNode[] = tasks.map((t) => ({
    id: t.id,
    key: t.templateKey ?? t.id,
    title: t.title,
    stage: t.stage,
    status: t.status,
    sort: t.sort,
    dependsOn: deps.filter((d) => d.taskId === t.id).map((d) => d.dependsOnTaskId),
  }));
  return { tasks, byId: new Map(tasks.map((t) => [t.id, t])), view: roadmapView(nodes, startingPoint) };
}
