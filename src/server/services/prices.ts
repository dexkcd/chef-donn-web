/**
 * The price-search hook. A search is queued (from the app or the API), run in the
 * background, and its observations stored with sources. Applying a price to an estimate is a
 * separate, human action — the API can trigger and read searches but never changes the budget.
 */
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db/client";
import { moneyLine, priceObservation, priceSearch, restaurantProfile, task } from "@/db/schema";
import { estimateFromPrices } from "@/domain/prices";
import { Rejection, userIdOf, type ServiceCtx } from "../context";
import { env } from "../env";
import { checkCallbackUrlShape, UnsafeCallbackError } from "../webhooks";
import { getLine, syncContingencyLine } from "./budget";
import { setTaskEstimate } from "./roadmap";

export const priceSearchInput = z.object({
  query: z.string().trim().min(3, "Describe what to price, e.g. “2-door commercial chiller”.").max(200),
  subject: z
    .object({ type: z.enum(["task", "money_line"]), id: z.uuid() })
    .nullable()
    .optional(),
  context: z
    .object({
      quantity: z.number().int().positive().max(10_000).optional(),
      unit: z.string().trim().max(40).optional(),
      spec: z.string().trim().max(500).optional(),
      location: z.string().trim().max(120).optional(),
    })
    .optional(),
  callbackUrl: z.string().max(2000).nullable().optional(),
  clientId: z.uuid().optional(),
});
export type PriceSearchInput = z.output<typeof priceSearchInput>;

export const applyPriceInput = z.object({
  priceSearchId: z.uuid(),
  /** Override the suggested estimate (centavos); defaults to typical × quantity. */
  estimateCents: z.number().int().positive().optional(),
  /** Needed when the task has no budget category yet. */
  categoryKey: z.string().optional(),
});

async function assertSubject(ctx: ServiceCtx, subject: NonNullable<PriceSearchInput["subject"]>) {
  if (subject.type === "task") {
    const [t] = await ctx.tx.select({ id: task.id }).from(task).where(and(eq(task.id, subject.id), eq(task.workspaceId, ctx.workspaceId)));
    if (!t) throw new Rejection("That task doesn't exist in this workspace.", { "subject.id": "Unknown task." }, 404);
  } else {
    await getLine(ctx, subject.id);
  }
}

export async function createPriceSearch(ctx: ServiceCtx, input: PriceSearchInput, via: "app" | "api") {
  if (input.clientId) {
    const [prior] = await ctx.tx
      .select()
      .from(priceSearch)
      .where(and(eq(priceSearch.workspaceId, ctx.workspaceId), eq(priceSearch.clientId, input.clientId)));
    if (prior) return { search: prior, created: false };
  }
  // Serialise per workspace so the daily limit can't be raced past.
  await ctx.tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`price_search:${ctx.workspaceId}`}))`);
  const [{ n }] = (await ctx.tx
    .select({ n: sql<number>`count(*)::int` })
    .from(priceSearch)
    .where(and(eq(priceSearch.workspaceId, ctx.workspaceId), gt(priceSearch.createdAt, new Date(ctx.now.getTime() - 86_400_000))))) as [{ n: number }];
  if (n >= env.priceSearchDailyLimit) {
    throw new Rejection(`Daily price-search limit reached (${env.priceSearchDailyLimit} in 24 hours). Try again later.`, undefined, 429);
  }
  if (input.subject) await assertSubject(ctx, input.subject);
  if (input.callbackUrl) {
    try {
      checkCallbackUrlShape(input.callbackUrl);
    } catch (e) {
      if (e instanceof UnsafeCallbackError) throw new Rejection(e.message, { callbackUrl: e.message }, 422);
      throw e;
    }
  }
  const [profile] = await ctx.tx.select().from(restaurantProfile).where(eq(restaurantProfile.workspaceId, ctx.workspaceId));
  const location = input.context?.location || (profile ? `${profile.barangay}, ${profile.municipalityName}` : "Palawan, Philippines");
  const [row] = await ctx.tx
    .insert(priceSearch)
    .values({
      workspaceId: ctx.workspaceId,
      query: input.query,
      context: { ...input.context, location },
      subjectType: input.subject?.type ?? "none",
      subjectId: input.subject?.id ?? null,
      requestedVia: via,
      requestedByUserId: userIdOf(ctx.actor),
      requestedByApiKeyId: ctx.actor.type === "api_key" ? ctx.actor.keyId : null,
      clientId: input.clientId ?? null,
      callbackUrl: input.callbackUrl ?? null,
      callbackStatus: input.callbackUrl ? "pending" : null,
    })
    .returning();
  await ctx.audit({ action: "prices.search", subjectType: "price_search", subjectId: row!.id, after: { query: input.query, via, subject: input.subject ?? null } });
  return { search: row!, created: true };
}

export async function getPriceSearch(exec: Executor, workspaceId: string, id: string) {
  const [search] = await exec
    .select()
    .from(priceSearch)
    .where(and(eq(priceSearch.id, id), eq(priceSearch.workspaceId, workspaceId)));
  if (!search) return null;
  const observations = await exec.select().from(priceObservation).where(eq(priceObservation.priceSearchId, id)).orderBy(asc(priceObservation.unitPriceCents));
  return { search, observations };
}

export async function listPriceSearches(exec: Executor, workspaceId: string, subject?: { type: string; id: string }, limit = 10) {
  return exec
    .select()
    .from(priceSearch)
    .where(
      and(
        eq(priceSearch.workspaceId, workspaceId),
        ...(subject ? [eq(priceSearch.subjectType, subject.type as "task" | "money_line"), eq(priceSearch.subjectId, subject.id)] : []),
      ),
    )
    .orderBy(desc(priceSearch.createdAt))
    .limit(limit);
}

/** The public JSON shape for the API and callbacks. */
export function serialisePriceSearch(r: NonNullable<Awaited<ReturnType<typeof getPriceSearch>>>) {
  const { search, observations } = r;
  return {
    id: search.id,
    status: search.status,
    query: search.query,
    context: search.context,
    subject: search.subjectType === "none" ? null : { type: search.subjectType, id: search.subjectId },
    error: search.error,
    summary: search.summary
      ? {
          currency: "PHP",
          lowCents: search.summary.low,
          typicalCents: search.summary.typical,
          highCents: search.summary.high,
          quantity: search.summary.quantity,
          suggestedEstimateCents: estimateFromPrices(search.summary),
          basis: search.summary.basis,
          observationsFound: search.summary.count,
          observationsUsed: search.summary.used,
          outliersDropped: search.summary.outliersDropped,
        }
      : null,
    observations: observations.map((o) => ({
      item: o.item,
      vendor: o.vendor,
      unitPriceCents: o.unitPriceCents,
      unit: o.unit,
      priceKind: o.priceKind,
      sellerLocation: o.sellerLocation,
      includesDeliveryToPalawan: o.includesDeliveryToPalawan,
      sourceUrl: o.sourceUrl,
      sourceTitle: o.sourceTitle,
      seenOn: o.seenOn,
      confidence: o.confidence,
    })),
    verified: false,
    provider: search.provider,
    createdAt: search.createdAt.toISOString(),
    completedAt: search.completedAt?.toISOString() ?? null,
  };
}

/** A person applies a found price to the task estimate or the manual line's plan. */
export async function applyPriceEstimate(ctx: ServiceCtx, input: z.output<typeof applyPriceInput>) {
  const found = await getPriceSearch(ctx.tx, ctx.workspaceId, input.priceSearchId);
  if (!found) throw new Rejection("That price search doesn't exist.", undefined, 404);
  const { search } = found;
  if (search.status !== "done" || !search.summary) throw new Rejection("This search has no prices to apply.");
  const estimate = input.estimateCents ?? estimateFromPrices(search.summary);
  if (search.subjectType === "task" && search.subjectId) {
    await setTaskEstimate(ctx, { taskId: search.subjectId, estimateCents: estimate, priceSearchId: search.id, categoryKey: input.categoryKey });
  } else if (search.subjectType === "money_line" && search.subjectId) {
    const line = await getLine(ctx, search.subjectId);
    if (line.locked) throw new Rejection("This line follows its roadmap task — apply the price on the task.");
    await ctx.tx.update(moneyLine).set({ plannedCents: estimate }).where(eq(moneyLine.id, line.id));
    await syncContingencyLine(ctx);
  } else {
    throw new Rejection("This search isn't attached to a task or budget line.");
  }
  await ctx.audit({ action: "prices.apply", subjectType: search.subjectType, subjectId: search.subjectId ?? undefined, after: { estimate, priceSearchId: search.id } });
  return { estimate };
}
