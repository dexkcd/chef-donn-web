/**
 * Receipts: capture (idempotent, exact duplicates blocked), confirm (a person checks every
 * required field; only then does a payment exist), reject. The AI never writes a payment.
 */
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db/client";
import { budgetCategory, document, documentLink, moneyLine, receipt, vendorRule } from "@/db/schema";
import { PAYMENT_METHODS } from "@/domain/budget";
import { vendorKey } from "@/domain/categorise";
import { isLocalDate } from "@/domain/dates";
import { duplicateSignals, needsDuplicateOverride, type DuplicateSignal } from "@/domain/duplicates";
import { vatCheck } from "@/domain/vat";
import type { DraftField, ReceiptDraft } from "@/lib/ai/receipt-types";
import { fingerprintOf } from "@/lib/receipts/draft";
import { actorCan, Rejection, userIdOf, type ServiceCtx } from "../context";
import { storage } from "../storage";
import { claimClientId, getLine, logPayment, recordClientResult, syncContingencyLine } from "./budget";

export const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const MAX_RECEIPT_BYTES = 12 * 1024 * 1024;

export const captureInput = z.object({
  clientId: z.uuid("Missing upload id."),
  mime: z.enum(ACCEPTED_MIME, "Send a photo (JPEG, PNG, WebP) or a PDF."),
  bytes: z.instanceof(Uint8Array).refine((b) => b.byteLength > 0, "The file is empty.").refine((b) => b.byteLength <= MAX_RECEIPT_BYTES, "That file is over 12 MB."),
  name: z.string().max(200).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

const extForMime: Record<(typeof ACCEPTED_MIME)[number], string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

export async function captureReceipt(ctx: ServiceCtx, input: z.output<typeof captureInput>) {
  const prior = await claimClientId(ctx, input.clientId, "receipt.capture");
  if (prior) {
    const [r] = await ctx.tx.select().from(receipt).where(eq(receipt.id, prior));
    if (r) return { receipt: r, duplicateOf: null as string | null, replayed: true };
  }
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const [same] = await ctx.tx
    .select({ r: receipt })
    .from(receipt)
    .innerJoin(document, eq(document.id, receipt.documentId))
    .where(and(eq(receipt.workspaceId, ctx.workspaceId), eq(document.sha256, sha256), ne(receipt.status, "rejected")))
    .limit(1);
  if (same) {
    await recordClientResult(ctx, input.clientId, same.r.id);
    return { receipt: same.r, duplicateOf: same.r.id, replayed: false };
  }

  const receiptId = input.clientId;
  const now = ctx.now;
  const key = `ws/${ctx.workspaceId}/receipts/${now.getUTCFullYear()}/${receiptId}.${extForMime[input.mime]}`;
  await storage().put(key, input.bytes, input.mime);
  const [doc] = await ctx.tx
    .insert(document)
    .values({ workspaceId: ctx.workspaceId, kind: "receipt", storageKey: key, mime: input.mime, bytes: input.bytes.byteLength, sha256, originalName: input.name ?? null, createdBy: userIdOf(ctx.actor) })
    .returning();
  const [r] = await ctx.tx
    .insert(receipt)
    .values({ id: receiptId, workspaceId: ctx.workspaceId, documentId: doc!.id, status: "uploaded", capturedBy: userIdOf(ctx.actor), lastError: null })
    .returning();
  await ctx.tx.insert(documentLink).values({ workspaceId: ctx.workspaceId, documentId: doc!.id, subjectType: "receipt", subjectId: r!.id });
  await recordClientResult(ctx, input.clientId, r!.id);
  await ctx.audit({ action: "receipt.capture", subjectType: "receipt", subjectId: r!.id, after: { sha256, bytes: input.bytes.byteLength, note: input.note ?? null } });
  return { receipt: r!, duplicateOf: null as string | null, replayed: false };
}

// ── confirm ───────────────────────────────────────────────────────────────────────────────
const cents = z.number({ error: "Enter an amount in pesos, like 1,250 or 1,250.50." }).int().min(0);
export const confirmInput = z
  .object({
    receiptId: z.uuid(),
    vendorName: z.string().trim().min(1, "Who was paid?").max(200),
    vendorTin: z.string().trim().max(40).nullable().optional(),
    docNumber: z.string().trim().max(60).nullable().optional(),
    date: z.string().refine(isLocalDate, "Pick the receipt date."),
    totalCents: cents.min(1, "Enter the total."),
    vatableCents: cents.nullable().optional(),
    vatCents: cents.nullable().optional(),
    method: z.enum(PAYMENT_METHODS),
    moneyLineId: z.uuid().nullable().optional(),
    newLine: z.object({ categoryId: z.uuid("Pick a category."), description: z.string().trim().min(1, "Describe the new line.").max(200) }).nullable().optional(),
    /** Which fields the person confirmed. Required fields must all be here. */
    confirmed: z.array(z.string()).default([]),
    notDuplicate: z.boolean().default(false),
  })
  .refine((v) => Boolean(v.moneyLineId) !== Boolean(v.newLine), { message: "Pick the budget line this belongs to.", path: ["moneyLineId"] });

const REQUIRED = ["vendorName", "date", "totalCents", "method", "moneyLineId"] as const;

async function loadForUpdate(ctx: ServiceCtx, receiptId: string) {
  const [row] = await ctx.tx
    .select({ r: receipt, d: document })
    .from(receipt)
    .innerJoin(document, eq(document.id, receipt.documentId))
    .where(and(eq(receipt.id, receiptId), eq(receipt.workspaceId, ctx.workspaceId)))
    .for("update", { of: receipt });
  if (!row) throw new Rejection("That receipt doesn't exist.", undefined, 404);
  return row;
}

export async function existingFingerprints(exec: Executor, workspaceId: string, excludeId: string) {
  const rows = await exec
    .select({ id: receipt.id, sha: document.sha256, vendorKey: receipt.vendorKey, docNumber: receipt.docNumber, totalCents: receipt.totalCents, receiptDate: receipt.receiptDate })
    .from(receipt)
    .innerJoin(document, eq(document.id, receipt.documentId))
    .where(and(eq(receipt.workspaceId, workspaceId), ne(receipt.id, excludeId), inArray(receipt.status, ["needs_review", "confirmed", "extraction_failed"])));
  return rows.map((r) => ({ id: r.id, sha256: r.sha, vendorKey: r.vendorKey, docNumber: r.docNumber, totalCents: r.totalCents, date: r.receiptDate }));
}

export async function confirmReceipt(ctx: ServiceCtx, input: z.output<typeof confirmInput>) {
  const { r, d } = await loadForUpdate(ctx, input.receiptId);
  if (r.status === "confirmed") {
    if (r.paymentId) return { receiptId: r.id, paymentId: r.paymentId, replayed: true };
  }
  if (r.status === "rejected") throw new Rejection("This receipt was rejected. Upload it again if that was a mistake.");
  if (r.status === "uploaded" || r.status === "extracting") throw new Rejection("Still reading this receipt — give it a moment.");

  const missing = REQUIRED.filter((f) => !input.confirmed.includes(f) && !(f === "moneyLineId" && input.newLine));
  if (missing.length > 0) {
    throw new Rejection("Confirm the payee, date, total, how it was paid and the budget line first.", Object.fromEntries(missing.map((m) => [m, "Tap ✓ to confirm."])), 422);
  }

  // Duplicate check with the values the person confirmed.
  const draftLike = {
    vendorName: { value: input.vendorName } as DraftField<string>,
    vendorTin: { value: input.vendorTin ?? null } as DraftField<string>,
    docNumber: { value: input.docNumber ?? null } as DraftField<string>,
    totalCents: { value: input.totalCents } as DraftField<number>,
    date: { value: input.date } as DraftField<string>,
  };
  const fp = fingerprintOf(r.id, d.sha256, draftLike);
  const signals: DuplicateSignal[] = duplicateSignals(fp, await existingFingerprints(ctx.tx, ctx.workspaceId, r.id));
  if (needsDuplicateOverride(signals) && !input.notDuplicate) {
    throw new Rejection("This looks like a receipt you already have (same seller and OR number). Check it, then tick “Not a duplicate” to save anyway.", { notDuplicate: "Check the earlier receipt first." }, 409);
  }

  // Which line: an existing one, or a new unplanned line (Owner/Partner only).
  let lineId = input.moneyLineId ?? null;
  if (input.newLine) {
    if (!actorCan(ctx.actor, "receipt.confirm_new_line")) throw new Rejection("Helpers can confirm against existing lines only. Ask the owner to add a line.", undefined, 403);
    const [cat] = await ctx.tx
      .select()
      .from(budgetCategory)
      .where(and(eq(budgetCategory.id, input.newLine.categoryId), eq(budgetCategory.workspaceId, ctx.workspaceId)));
    if (!cat || cat.archivedAt || cat.kind === "contingency") throw new Rejection("Pick a budget category for the new line.", { "newLine.categoryId": "Pick a category." });
    const [line] = await ctx.tx
      .insert(moneyLine)
      .values({
        workspaceId: ctx.workspaceId,
        categoryId: cat.id,
        description: input.newLine.description,
        plannedCents: 0,
        sourceType: "receipt_unplanned",
        sourceId: r.id,
        payeeName: input.vendorName,
        createdBy: userIdOf(ctx.actor),
      })
      .returning();
    lineId = line!.id;
  } else if (lineId) {
    const line = await getLine(ctx, lineId);
    if (line.sourceType === "contingency_rule") throw new Rejection("Pick the line this was for, not the contingency line.");
  }

  const pay = await logPayment(ctx, {
    moneyLineId: lineId!,
    amountCents: input.totalCents,
    paidOn: input.date,
    method: input.method,
    payeeName: input.vendorName,
    referenceNo: input.docNumber ?? null,
    receiptDocumentId: d.id,
  });
  await ctx.tx.insert(documentLink).values({ workspaceId: ctx.workspaceId, documentId: d.id, subjectType: "payment", subjectId: pay.id }).onConflictDoNothing();

  const person = <T>(v: T | null): DraftField<T> => ({ value: v, confidence: null, confirmed: true, source: "person" });
  const prev = r.draft;
  const [line] = await ctx.tx.select().from(moneyLine).where(eq(moneyLine.id, lineId!));
  const finalDraft: ReceiptDraft = {
    ...(prev ?? ({} as ReceiptDraft)),
    vendorName: person(input.vendorName),
    vendorTin: person(input.vendorTin ?? null),
    docNumber: person(input.docNumber ?? null),
    date: person(input.date),
    totalCents: person(input.totalCents),
    vatableCents: person(input.vatableCents ?? null),
    vatCents: person(input.vatCents ?? null),
    method: person(input.method),
    categoryId: person(line!.categoryId),
    moneyLineId: person(lineId),
    vatWarnings: vatCheck({ totalCents: input.totalCents, vatableCents: input.vatableCents ?? null, vatCents: input.vatCents ?? null, vatExemptCents: null, zeroRatedCents: null }),
  };
  await ctx.tx
    .update(receipt)
    .set({
      status: "confirmed",
      draft: finalDraft,
      duplicateSignals: signals,
      vendorKey: fp.vendorKey,
      docNumber: fp.docNumber,
      totalCents: input.totalCents,
      receiptDate: input.date,
      paymentId: pay.id,
      confirmedBy: userIdOf(ctx.actor),
      confirmedAt: ctx.now,
    })
    .where(eq(receipt.id, r.id));

  // Learn: next time this seller's receipt suggests the same category and line.
  if (fp.vendorKey) {
    await ctx.tx
      .insert(vendorRule)
      .values({ workspaceId: ctx.workspaceId, vendorKey: fp.vendorKey, vendorName: input.vendorName, categoryId: line!.categoryId, moneyLineId: line!.sourceType === "receipt_unplanned" ? null : line!.id, hits: 1, lastReceiptId: r.id })
      .onConflictDoUpdate({
        target: [vendorRule.workspaceId, vendorRule.vendorKey],
        set: {
          vendorName: input.vendorName,
          categoryId: line!.categoryId,
          moneyLineId: line!.sourceType === "receipt_unplanned" ? null : line!.id,
          hits: sql`${vendorRule.hits} + 1`,
          lastReceiptId: r.id,
          updatedAt: sql`now()`,
        },
      });
  }
  if (input.newLine) await syncContingencyLine(ctx);
  await ctx.audit({ action: "receipt.confirm", subjectType: "receipt", subjectId: r.id, after: { paymentId: pay.id, lineId, totalCents: input.totalCents, newLine: Boolean(input.newLine) } });
  return { receiptId: r.id, paymentId: pay.id, replayed: false };
}

export const rejectInput = z.object({ receiptId: z.uuid(), reason: z.string().trim().min(1, "Say why — e.g. “duplicate” or “personal expense”.").max(300) });

export async function rejectReceipt(ctx: ServiceCtx, input: z.output<typeof rejectInput>) {
  const { r } = await loadForUpdate(ctx, input.receiptId);
  if (r.status === "confirmed") throw new Rejection("This receipt is already a payment. Void the payment on its budget line instead.");
  await ctx.tx.update(receipt).set({ status: "rejected", rejectedReason: input.reason }).where(eq(receipt.id, r.id));
  await ctx.audit({ action: "receipt.reject", subjectType: "receipt", subjectId: r.id, after: { reason: input.reason } });
}

// ── reads ─────────────────────────────────────────────────────────────────────────────────
export async function listReceipts(exec: Executor, workspaceId: string) {
  return exec
    .select({ r: receipt, d: { mime: document.mime, createdAt: document.createdAt } })
    .from(receipt)
    .innerJoin(document, eq(document.id, receipt.documentId))
    .where(eq(receipt.workspaceId, workspaceId))
    .orderBy(desc(receipt.createdAt))
    .limit(200);
}

export async function getReceipt(exec: Executor, workspaceId: string, id: string) {
  const [row] = await exec
    .select({ r: receipt, d: document })
    .from(receipt)
    .innerJoin(document, eq(document.id, receipt.documentId))
    .where(and(eq(receipt.id, id), eq(receipt.workspaceId, workspaceId)));
  return row ?? null;
}

/** Lines a receipt can be filed against: open, not voided, not the contingency rule. */
export async function openLines(exec: Executor, workspaceId: string) {
  return exec
    .select()
    .from(moneyLine)
    .where(and(eq(moneyLine.workspaceId, workspaceId), isNull(moneyLine.voidedAt), isNull(moneyLine.closedAt), ne(moneyLine.sourceType, "contingency_rule")))
    .orderBy(moneyLine.description);
}

export { vendorKey };
