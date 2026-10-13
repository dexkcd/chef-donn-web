/**
 * Reads uploaded receipts in the background. Same claiming pattern as price searches: one
 * atomic UPDATE, so the upload's after() and the sweeper never read the same receipt twice.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { budgetCategory, document, receipt, vendorRule } from "@/db/schema";
import { suggestCategory, vendorKey } from "@/domain/categorise";
import { manilaToday } from "@/domain/dates";
import { duplicateSignals } from "@/domain/duplicates";
import { receiptExtractor } from "@/lib/ai/receipts";
import { buildDraft, emptyDraft, fingerprintOf } from "@/lib/receipts/draft";
import { existingFingerprints, openLines } from "../services/receipts";
import { storage } from "../storage";

const MAX_ATTEMPTS = 3;
const STALE = sql`now() - interval '5 minutes'`;

async function claim(id: string) {
  const [row] = await db
    .update(receipt)
    .set({ status: "extracting", attempts: sql`${receipt.attempts} + 1`, claimedAt: sql`now()` })
    .where(and(eq(receipt.id, id), sql`(${receipt.status} = 'uploaded' or (${receipt.status} = 'extracting' and ${receipt.claimedAt} < ${STALE}))`))
    .returning();
  return row ?? null;
}

export async function extractReceipt(id: string): Promise<"needs_review" | "extraction_failed" | "retry" | "skipped"> {
  const row = await claim(id);
  if (!row) return "skipped";
  const [doc] = await db.select().from(document).where(eq(document.id, row.documentId));
  if (!doc) throw new Error(`receipt ${id} has no document`);
  const extractor = receiptExtractor();
  try {
    const [cats, lines] = await Promise.all([
      db
        .select()
        .from(budgetCategory)
        .where(and(eq(budgetCategory.workspaceId, row.workspaceId), isNull(budgetCategory.archivedAt))),
      openLines(db, row.workspaceId),
    ]);
    const categories = cats.filter((c) => c.kind !== "contingency");
    const bytes = await storage().get(doc.storageKey);
    const extraction = await extractor.extract({
      bytes,
      mime: doc.mime,
      sha256: doc.sha256,
      context: {
        categories: categories.map((c) => ({ id: c.id, name: c.name, hint: c.hint })),
        openLines: lines.map((l) => ({ id: l.id, categoryId: l.categoryId, description: l.description })),
        today: manilaToday(new Date()),
      },
    });
    // Look the seller up by TIN first, then by name (an earlier receipt may not have shown a TIN).
    const keys = [vendorKey({ tin: extraction.vendorTin.value, name: null }), vendorKey({ tin: null, name: extraction.vendorName.value })].filter(
      (k): k is string => k !== null,
    );
    const rules = keys.length > 0 ? await db.select().from(vendorRule).where(and(eq(vendorRule.workspaceId, row.workspaceId), inArray(vendorRule.vendorKey, keys))) : [];
    const rule = keys.map((k) => rules.find((r) => r.vendorKey === k)).find((r) => r !== undefined);
    const suggestion = suggestCategory({
      rule: rule ? { vendorKey: rule.vendorKey, categoryId: rule.categoryId, moneyLineId: rule.moneyLineId, hits: rule.hits } : null,
      ai: { categoryId: extraction.suggestedCategoryId, moneyLineId: extraction.suggestedMoneyLineId, confidence: extraction.categoryConfidence },
      validCategoryIds: new Set(categories.map((c) => c.id)),
      validLines: new Map(lines.map((l) => [l.id, l.categoryId])),
    });
    const draft = buildDraft(extraction, suggestion, { aiOff: extractor.name === "null" });
    const fp = fingerprintOf(row.id, doc.sha256, draft);
    const signals = duplicateSignals(fp, await existingFingerprints(db, row.workspaceId, row.id));
    await db
      .update(receipt)
      .set({
        status: "needs_review",
        extraction,
        draft,
        suggestionSource: suggestion.source,
        suggestedCategoryId: suggestion.categoryId,
        suggestedMoneyLineId: suggestion.moneyLineId,
        duplicateSignals: signals,
        vendorKey: fp.vendorKey,
        docNumber: fp.docNumber,
        totalCents: fp.totalCents,
        receiptDate: fp.date,
        lastError: null,
      })
      .where(eq(receipt.id, row.id));
    return "needs_review";
  } catch (e) {
    const final = row.attempts >= MAX_ATTEMPTS;
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    await db
      .update(receipt)
      .set(final ? { status: "extraction_failed", lastError: msg, draft: emptyDraft({ aiOff: false }) } : { status: "uploaded", lastError: msg })
      .where(eq(receipt.id, row.id));
    console.warn(`[receipts] extraction ${final ? "failed" : "will retry"} for ${row.id}: ${msg}`);
    return final ? "extraction_failed" : "retry";
  }
}

export async function sweepReceipts(limit = 5): Promise<number> {
  const rows = await db
    .select({ id: receipt.id })
    .from(receipt)
    .where(sql`${receipt.status} = 'uploaded' or (${receipt.status} = 'extracting' and ${receipt.claimedAt} < ${STALE})`)
    .orderBy(receipt.createdAt)
    .limit(limit);
  let n = 0;
  for (const r of rows) if ((await extractReceipt(r.id)) !== "skipped") n++;
  return n;
}
