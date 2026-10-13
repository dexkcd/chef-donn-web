/**
 * Runs queued price searches. Claiming is one atomic UPDATE, so two workers (the request's
 * after() and the sweeper) can never run the same search twice. Failures retry up to three
 * attempts; then the search fails with a reason and the callback (if any) is told.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { priceObservation, priceSearch, workspace } from "@/db/schema";
import { summarisePrices } from "@/domain/prices";
import { priceSearchProvider } from "@/lib/ai/price-search";
import { PriceSearchFailed } from "@/lib/ai/price-search/claude-web-search";
import { PriceSearchUnavailableError } from "@/lib/ai/price-search/types";
import { getPriceSearch, serialisePriceSearch } from "../services/prices";
import { deliverWebhook } from "../webhooks";

const MAX_ATTEMPTS = 3;
const STALE_RUNNING = sql`now() - interval '5 minutes'`;

async function claim(id: string) {
  const [row] = await db
    .update(priceSearch)
    .set({ status: "running", attempts: sql`${priceSearch.attempts} + 1`, claimedAt: sql`now()` })
    .where(and(eq(priceSearch.id, id), sql`(${priceSearch.status} = 'queued' or (${priceSearch.status} = 'running' and ${priceSearch.claimedAt} < ${STALE_RUNNING}))`))
    .returning();
  return row ?? null;
}

function userFacing(e: unknown): string {
  if (e instanceof PriceSearchFailed || e instanceof PriceSearchUnavailableError) return e.message;
  const msg = e instanceof Error ? e.message : String(e);
  return `Search failed: ${msg}`.slice(0, 300);
}

export async function runPriceSearch(id: string): Promise<"done" | "failed" | "retry" | "skipped"> {
  const row = await claim(id);
  if (!row) return "skipped";
  let outcome: "done" | "failed" | "retry";
  try {
    const result = await priceSearchProvider().search({ query: row.query, context: row.context });
    const summary = summarisePrices(result.observations, { quantity: row.context.quantity ?? 1 });
    await db.transaction(async (tx) => {
      await tx.delete(priceObservation).where(eq(priceObservation.priceSearchId, row.id));
      if (result.observations.length > 0) {
        await tx.insert(priceObservation).values(
          result.observations.map((o) => ({
            priceSearchId: row.id,
            item: o.item,
            vendor: o.vendor,
            unitPriceCents: o.unitPriceCents,
            unit: o.unit,
            priceKind: o.priceKind,
            sellerLocation: o.sellerLocation,
            includesDeliveryToPalawan: o.includesDeliveryToPalawan,
            sourceUrl: o.sourceUrl,
            sourceTitle: o.sourceTitle,
            seenOn: o.seenOn && /^\d{4}-\d{2}-\d{2}$/.test(o.seenOn) ? o.seenOn : null,
            confidence: o.confidence,
            notes: o.notes,
          })),
        );
      }
      await tx
        .update(priceSearch)
        .set({
          status: "done",
          summary,
          error: result.observations.length === 0 ? (result.notes ?? "No prices with a real source were found.") : null,
          provider: result.provider,
          model: result.model,
          promptVersion: result.promptVersion,
          rawTranscript: { ...(result.transcript as object | null), droppedUnsourced: result.droppedUnsourced },
          completedAt: new Date(),
        })
        .where(eq(priceSearch.id, row.id));
    });
    outcome = "done";
  } catch (e) {
    const final = row.attempts >= MAX_ATTEMPTS || e instanceof PriceSearchUnavailableError;
    await db
      .update(priceSearch)
      .set({ status: final ? "failed" : "queued", error: userFacing(e), completedAt: final ? new Date() : null })
      .where(eq(priceSearch.id, row.id));
    if (!final) console.warn(`[price-search] ${row.id} attempt ${row.attempts} failed, will retry`, e);
    outcome = final ? "failed" : "retry";
  }
  if (outcome !== "retry" && row.callbackUrl) await deliverPriceSearchCallback(row.id);
  return outcome;
}

export async function deliverPriceSearchCallback(id: string): Promise<void> {
  const [row] = await db
    .select({ s: priceSearch, secret: workspace.webhookSecret })
    .from(priceSearch)
    .innerJoin(workspace, eq(workspace.id, priceSearch.workspaceId))
    .where(eq(priceSearch.id, id));
  if (!row?.s.callbackUrl) return;
  const full = await getPriceSearch(db, row.s.workspaceId, id);
  if (!full) return;
  const result = await deliverWebhook({
    url: row.s.callbackUrl,
    secret: row.secret,
    event: `price_search.${row.s.status === "done" ? "done" : "failed"}`,
    payload: serialisePriceSearch(full),
  });
  await db
    .update(priceSearch)
    .set({ callbackStatus: result.delivered ? "delivered" : "failed", callbackAttempts: sql`${priceSearch.callbackAttempts} + ${result.attempts}` })
    .where(eq(priceSearch.id, id));
  if (!result.delivered) console.warn(`[price-search] callback for ${id} failed: ${result.error}`);
}

/** Pick up searches that are queued or stuck (e.g. the server restarted mid-search). */
export async function sweepPriceSearches(limit = 5): Promise<number> {
  const rows = await db
    .select({ id: priceSearch.id })
    .from(priceSearch)
    .where(sql`${priceSearch.status} = 'queued' or (${priceSearch.status} = 'running' and ${priceSearch.claimedAt} < ${STALE_RUNNING})`)
    .orderBy(priceSearch.createdAt)
    .limit(limit);
  let ran = 0;
  for (const r of rows) if ((await runPriceSearch(r.id)) !== "skipped") ran++;
  return ran;
}
