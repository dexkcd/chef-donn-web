/**
 * Drafts queued AI plans. Same claiming pattern as receipts and price searches: one atomic
 * UPDATE, so the request's after() and the sweeper never draft the same plan twice.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { planDraft } from "@/db/schema";
import { manilaToday } from "@/domain/dates";
import { planDrafter } from "@/lib/ai/plan";
import { PlanDraftFailed, PlanDraftUnavailableError } from "@/lib/ai/plan/types";
import { buildPlanContext } from "../services/ai-plan";

const MAX_ATTEMPTS = 3;
const STALE = sql`now() - interval '10 minutes'`;

async function claim(id: string) {
  const [row] = await db
    .update(planDraft)
    .set({ status: "running", attempts: sql`${planDraft.attempts} + 1`, claimedAt: sql`now()` })
    .where(and(eq(planDraft.id, id), sql`(${planDraft.status} = 'queued' or (${planDraft.status} = 'running' and ${planDraft.claimedAt} < ${STALE}))`))
    .returning();
  return row ?? null;
}

export async function runPlanDraft(id: string): Promise<"ready" | "failed" | "retry" | "skipped"> {
  const row = await claim(id);
  if (!row) return "skipped";
  const started = Date.now();
  try {
    const ctx = await buildPlanContext(db, row.workspaceId, row.answers, manilaToday(new Date()));
    const result = await planDrafter().draft(ctx);
    await db
      .update(planDraft)
      .set({ status: "ready", proposal: result.proposal, raw: result.raw, provider: result.provider, model: result.model, promptVersion: result.promptVersion, lastError: null, completedAt: new Date() })
      .where(eq(planDraft.id, row.id));
    console.info(`[plan] drafted ${row.id} in ${((Date.now() - started) / 1000).toFixed(1)}s · ${result.model ?? result.provider} · ${result.proposal.items.length} changes · ${result.proposal.dropped} dropped`);
    return "ready";
  } catch (e) {
    const final = row.attempts >= MAX_ATTEMPTS || e instanceof PlanDraftUnavailableError;
    const msg = (e instanceof PlanDraftFailed || e instanceof PlanDraftUnavailableError ? e.message : `Drafting failed: ${e instanceof Error ? e.message : String(e)}`).slice(0, 300);
    await db
      .update(planDraft)
      .set(final ? { status: "failed", lastError: msg, completedAt: new Date() } : { status: "queued", lastError: msg })
      .where(eq(planDraft.id, row.id));
    console.warn(`[plan] draft ${row.id} ${final ? "failed" : "will retry"}: ${msg}`);
    return final ? "failed" : "retry";
  }
}

/** Pick up drafts that are queued or stuck (e.g. the server restarted mid-draft). */
export async function sweepPlanDrafts(limit = 3): Promise<number> {
  const rows = await db
    .select({ id: planDraft.id })
    .from(planDraft)
    .where(sql`${planDraft.status} = 'queued' or (${planDraft.status} = 'running' and ${planDraft.claimedAt} < ${STALE})`)
    .orderBy(planDraft.createdAt)
    .limit(limit);
  let n = 0;
  for (const r of rows) if ((await runPlanDraft(r.id)) !== "skipped") n++;
  return n;
}
