/**
 * AI-drafted budget plans. Requesting a draft only queues it; Claude's proposal is stored as
 * data; nothing touches the budget until a person applies the items they ticked. Applying goes
 * through the same services as editing by hand (task estimates move their locked lines,
 * contingency re-syncs), all in one transaction.
 */
import { and, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db/client";
import { budgetCategory, moneyLine, planDraft, restaurantProfile, task } from "@/db/schema";
import { planAnswersSchema, type PlanAnswers, type PlanItem } from "@/domain/plan";
import type { PlanContext } from "@/lib/ai/plan/types";
import { env } from "../env";
import { Rejection, userIdOf, type ServiceCtx } from "../context";
import { createLine, updateLine } from "./budget";
import { setTaskEstimate } from "./roadmap";

export const requestPlanInput = z.object({ answers: planAnswersSchema });

export async function requestPlanDraft(ctx: ServiceCtx, input: z.output<typeof requestPlanInput>) {
  // Serialise per workspace so the daily limit can't be raced past.
  await ctx.tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`plan_draft:${ctx.workspaceId}`}))`);
  const [{ n }] = (await ctx.tx
    .select({ n: sql<number>`count(*)::int` })
    .from(planDraft)
    .where(and(eq(planDraft.workspaceId, ctx.workspaceId), gt(planDraft.createdAt, new Date(ctx.now.getTime() - 86_400_000))))) as [{ n: number }];
  if (n >= env.planDraftDailyLimit) {
    throw new Rejection(`Daily limit for AI drafts reached (${env.planDraftDailyLimit} in 24 hours). Try again tomorrow, or adjust amounts on the category pages.`, undefined, 429);
  }
  const [draft] = await ctx.tx.insert(planDraft).values({ workspaceId: ctx.workspaceId, answers: input.answers, requestedBy: userIdOf(ctx.actor) }).returning();
  await ctx.audit({ action: "plan.request", subjectType: "plan_draft", subjectId: draft!.id, after: { answers: input.answers } });
  return draft!;
}

/** What the planner sees: the profile, cost-bearing tasks, and the other open budget lines. */
export async function buildPlanContext(exec: Executor, workspaceId: string, answers: PlanAnswers, today: string): Promise<PlanContext> {
  const [profile] = await exec.select().from(restaurantProfile).where(eq(restaurantProfile.workspaceId, workspaceId));
  if (!profile) throw new Error(`no profile for workspace ${workspaceId}`);
  const cats = (await exec.select().from(budgetCategory).where(and(eq(budgetCategory.workspaceId, workspaceId), isNull(budgetCategory.archivedAt)))).sort((a, b) => a.sort - b.sort);
  const costCats = cats.filter((c) => c.kind !== "contingency");
  const catByKey = new Map(costCats.map((c) => [c.key, c]));
  const contingencyIds = new Set(cats.filter((c) => c.kind === "contingency").map((c) => c.id));

  const tasks = (await exec.select().from(task).where(and(eq(task.workspaceId, workspaceId), ne(task.status, "skipped")))).sort((a, b) => a.sort - b.sort);
  const lines = await exec
    .select()
    .from(moneyLine)
    .where(and(eq(moneyLine.workspaceId, workspaceId), isNull(moneyLine.voidedAt)));
  const lineByTask = new Map(lines.filter((l) => l.sourceType === "task" && l.sourceId).map((l) => [l.sourceId!, l]));

  return {
    restaurant: {
      name: profile.name,
      concept: profile.concept,
      place: `${profile.barangay}, ${profile.municipalityName}`,
      startingPoint: profile.startingPoint,
      targetOpeningDate: profile.targetOpeningDate,
      totalBudgetCents: profile.totalBudgetCents,
      contingencyBp: profile.contingencyBp,
    },
    answers,
    categories: costCats.map((c) => ({ id: c.id, name: c.name, hint: c.hint, kind: c.kind })),
    tasks: tasks
      .filter((t) => t.categoryKey && catByKey.has(t.categoryKey))
      .map((t) => {
        const line = lineByTask.get(t.id);
        return {
          id: t.id,
          title: t.title,
          stage: t.stage,
          status: t.status,
          categoryId: catByKey.get(t.categoryKey!)!.id,
          lineId: line?.id ?? null,
          currentCents: line?.plannedCents ?? t.estimateCents ?? 0,
          minCents: t.costMinCents,
          maxCents: t.costMaxCents,
          basis: t.estimateBasis,
        };
      }),
    lines: lines
      .filter((l) => l.sourceType !== "task" && l.sourceType !== "contingency_rule" && !l.closedAt && !contingencyIds.has(l.categoryId))
      .map((l) => ({ id: l.id, categoryId: l.categoryId, description: l.description, plannedCents: l.plannedCents, sourceType: l.sourceType })),
    today,
  };
}

/** Proposals as of now: "current" is re-read from the live budget, and no-ops are hidden. */
export async function liveItems(exec: Executor, workspaceId: string, items: readonly PlanItem[]): Promise<PlanItem[]> {
  const taskIds = items.flatMap((i) => (i.kind === "task" ? [i.taskId] : []));
  const lineIds = items.flatMap((i) => (i.kind !== "new" && i.lineId ? [i.lineId] : []));
  const tasks = taskIds.length > 0 ? await exec.select().from(task).where(and(eq(task.workspaceId, workspaceId), inArray(task.id, taskIds))) : [];
  const lines = lineIds.length > 0 ? await exec.select().from(moneyLine).where(and(eq(moneyLine.workspaceId, workspaceId), inArray(moneyLine.id, lineIds))) : [];
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const lineById = new Map(lines.filter((l) => !l.voidedAt).map((l) => [l.id, l]));
  return items.flatMap((i): PlanItem[] => {
    if (i.kind === "new") return [i];
    if (i.kind === "task") {
      const t = taskById.get(i.taskId);
      if (!t || t.status === "skipped") return [];
      const current = (i.lineId ? lineById.get(i.lineId)?.plannedCents : undefined) ?? t.estimateCents ?? 0;
      return current === i.proposedCents ? [] : [{ ...i, currentCents: current }];
    }
    const l = lineById.get(i.lineId);
    if (!l || l.closedAt) return [];
    return l.plannedCents === i.proposedCents ? [] : [{ ...i, currentCents: l.plannedCents }];
  });
}

export const applyPlanInput = z.object({
  draftId: z.uuid(),
  itemIds: z.array(z.string().min(1)).min(1, "Tick at least one change to apply.").max(500),
});

async function loadDraftForUpdate(ctx: ServiceCtx, draftId: string) {
  const [d] = await ctx.tx
    .select()
    .from(planDraft)
    .where(and(eq(planDraft.id, draftId), eq(planDraft.workspaceId, ctx.workspaceId)))
    .for("update");
  if (!d) throw new Rejection("That draft doesn't exist.", undefined, 404);
  return d;
}

export async function applyPlanDraft(ctx: ServiceCtx, input: z.output<typeof applyPlanInput>) {
  const d = await loadDraftForUpdate(ctx, input.draftId);
  if (d.status === "applied") throw new Rejection("This draft was already applied.");
  if (d.status === "discarded") throw new Rejection("This draft was discarded — ask the AI for a new one.");
  if (d.status !== "ready" || !d.proposal) throw new Rejection("The draft isn't ready yet.");
  const byId = new Map(d.proposal.items.map((i) => [i.id, i]));
  const unknown = input.itemIds.filter((id) => !byId.has(id));
  if (unknown.length > 0) throw new Rejection("Some ticked changes aren't in this draft — reload and try again.");

  for (const id of new Set(input.itemIds)) {
    const i = byId.get(id)!;
    if (i.kind === "task") {
      const [t] = await ctx.tx.select().from(task).where(and(eq(task.id, i.taskId), eq(task.workspaceId, ctx.workspaceId)));
      if (!t) throw new Rejection(`"${i.description}" is no longer on the roadmap — untick it and apply the rest.`);
      if (t.status === "skipped") throw new Rejection(`"${t.title}" is skipped on the roadmap — untick it or un-skip the task.`);
      await setTaskEstimate(ctx, { taskId: t.id, estimateCents: i.proposedCents }, { basis: "ai_plan" });
    } else if (i.kind === "line") {
      const [l] = await ctx.tx.select().from(moneyLine).where(and(eq(moneyLine.id, i.lineId), eq(moneyLine.workspaceId, ctx.workspaceId)));
      if (!l || l.voidedAt) throw new Rejection(`"${i.description}" was removed — untick it and apply the rest.`);
      if (l.closedAt) throw new Rejection(`"${l.description}" is finished — untick it or reopen the line.`);
      await updateLine(ctx, { lineId: l.id, plannedCents: i.proposedCents });
    } else {
      await createLine(ctx, { categoryId: i.categoryId, description: i.description, plannedCents: i.proposedCents, committedCents: 0 }, { sourceType: "ai_plan" });
    }
  }
  const itemIds = [...new Set(input.itemIds)];
  await ctx.tx.update(planDraft).set({ status: "applied", appliedBy: userIdOf(ctx.actor), appliedAt: ctx.now, appliedItems: itemIds }).where(eq(planDraft.id, d.id));
  await ctx.audit({ action: "plan.apply", subjectType: "plan_draft", subjectId: d.id, after: { itemIds } });
  return { applied: itemIds.length };
}

export const draftIdInput = z.object({ draftId: z.uuid() });

export async function discardPlanDraft(ctx: ServiceCtx, input: z.output<typeof draftIdInput>) {
  const d = await loadDraftForUpdate(ctx, input.draftId);
  if (d.status === "applied") throw new Rejection("This draft was already applied — change amounts on the category pages, or redo the AI setup.");
  await ctx.tx.update(planDraft).set({ status: "discarded" }).where(eq(planDraft.id, d.id));
  await ctx.audit({ action: "plan.discard", subjectType: "plan_draft", subjectId: d.id });
}

// ── reads ─────────────────────────────────────────────────────────────────────────────────
export async function getPlanDraft(exec: Executor, workspaceId: string, id: string) {
  const [d] = await exec.select().from(planDraft).where(and(eq(planDraft.id, id), eq(planDraft.workspaceId, workspaceId)));
  return d ?? null;
}

/** The answers from the most recent draft, to prefill "Redo the AI setup". */
export async function lastPlanAnswers(exec: Executor, workspaceId: string): Promise<PlanAnswers | null> {
  const [d] = await exec.select({ answers: planDraft.answers }).from(planDraft).where(eq(planDraft.workspaceId, workspaceId)).orderBy(desc(planDraft.createdAt)).limit(1);
  return d?.answers ?? null;
}
