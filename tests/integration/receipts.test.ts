import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { auditEvent, budgetCategory, moneyLine, payment, receipt, vendorRule } from "@/db/schema";
import { runAction, type Principal } from "@/server/context";
import { extractReceipt } from "@/server/jobs/extraction";
import { budgetOverview } from "@/server/services/budget-data";
import { createLine, createLineInput } from "@/server/services/budget";
import { captureInput, captureReceipt, confirmInput, confirmReceipt, retryExtraction, retryExtractionInput } from "@/server/services/receipts";
import { expectOk, makeWorkspace } from "./helpers";

const jpeg = (seed: string) => new Uint8Array(Buffer.from(`\xff\xd8\xff fake jpeg ${seed}`));

async function capture(p: Principal, bytes: Uint8Array, clientId = randomUUID()) {
  return expectOk(await runAction(p, "receipt.capture", captureInput, { clientId, mime: "image/jpeg", bytes, name: "r.jpg" }, captureReceipt));
}

async function setup() {
  const w = await makeWorkspace();
  const [equip] = await db.select().from(budgetCategory).where(and(eq(budgetCategory.workspaceId, w.ws.id), eq(budgetCategory.key, "equipment")));
  const line = expectOk(await runAction(w.ownerPrincipal, "line.create", createLineInput, { categoryId: equip!.id, description: "Kitchen equipment", plannedCents: 50_000_00 }, createLine));
  return { ...w, equip: equip!, line };
}

const ALL = ["vendorName", "date", "totalCents", "method", "moneyLineId"];

describe("receipts", () => {
  it("capture is idempotent on clientId and refuses to store the same file twice", async () => {
    const { ownerPrincipal } = await setup();
    const id = randomUUID();
    const a = await capture(ownerPrincipal, jpeg("a"), id);
    const replay = await capture(ownerPrincipal, jpeg("a"), id);
    expect(replay).toMatchObject({ replayed: true });
    expect(replay.receipt.id).toBe(a.receipt.id);
    const dup = await capture(ownerPrincipal, jpeg("a"));
    expect(dup.duplicateOf).toBe(a.receipt.id);
  });

  it("reads with the extractor into an unconfirmed draft, once, even if two workers race", async () => {
    const { ownerPrincipal, line } = await setup();
    const { receipt: r } = await capture(ownerPrincipal, jpeg("b"));
    const [x, y] = await Promise.all([extractReceipt(r.id), extractReceipt(r.id)]);
    expect([x, y].sort()).toEqual(["needs_review", "skipped"]);
    const [row] = await db.select().from(receipt).where(eq(receipt.id, r.id));
    expect(row!.status).toBe("needs_review");
    expect(row!.draft!.totalCents).toMatchObject({ value: 1120_00, confirmed: false, source: "ai" });
    expect(row!.draft!.moneyLineId.value).toBe(line.id);
    expect(row!.attempts).toBe(1);
  });

  it("won't become a payment until the required fields are confirmed; then pays the line and learns the vendor", async () => {
    const { ws, ownerPrincipal, line, equip } = await setup();
    const { receipt: r } = await capture(ownerPrincipal, jpeg("c"));
    await extractReceipt(r.id);
    const base = { receiptId: r.id, vendorName: "Port Barton Hardware", date: "2026-10-12", totalCents: 1120_00, method: "cash", moneyLineId: line.id };

    const early = await runAction(ownerPrincipal, "receipt.confirm_existing_line", confirmInput, { ...base, confirmed: ["vendorName"] }, confirmReceipt);
    expect(early).toMatchObject({ ok: false, status: 422 });
    expect(await db.select().from(payment).where(eq(payment.workspaceId, ws.id))).toHaveLength(0);

    const ok = expectOk(await runAction(ownerPrincipal, "receipt.confirm_existing_line", confirmInput, { ...base, confirmed: ALL }, confirmReceipt));
    const [p] = await db.select().from(payment).where(eq(payment.id, ok.paymentId));
    expect(p).toMatchObject({ amountCents: 1120_00, moneyLineId: line.id, paidOn: "2026-10-12" });
    const [rule] = await db.select().from(vendorRule).where(eq(vendorRule.workspaceId, ws.id));
    expect(rule).toMatchObject({ vendorKey: "name:port barton hardware", categoryId: equip.id, moneyLineId: line.id, hits: 1 });

    // Confirming again is a no-op, not a second payment.
    const again = expectOk(await runAction(ownerPrincipal, "receipt.confirm_existing_line", confirmInput, { ...base, confirmed: ALL }, confirmReceipt));
    expect(again).toMatchObject({ replayed: true, paymentId: ok.paymentId });
  });

  it("helpers confirm against existing lines only; an unplanned line draws on contingency", async () => {
    const { ws, ownerPrincipal, as, equip } = await setup();
    const helper = await as("helper");
    const { receipt: r } = await capture(helper, jpeg("d"));
    await extractReceipt(r.id);
    const input = {
      receiptId: r.id,
      vendorName: "Island Ice",
      date: "2026-10-12",
      totalCents: 800_00,
      method: "gcash",
      moneyLineId: null,
      newLine: { categoryId: equip.id, description: "Ice chest" },
      confirmed: ALL,
    };
    const byHelper = await runAction(helper, "receipt.confirm_existing_line", confirmInput, input, confirmReceipt);
    expect(byHelper).toMatchObject({ ok: false, status: 403 });

    expectOk(await runAction(ownerPrincipal, "receipt.confirm_new_line", confirmInput, input, confirmReceipt));
    const [unplanned] = await db.select().from(moneyLine).where(and(eq(moneyLine.workspaceId, ws.id), eq(moneyLine.sourceType, "receipt_unplanned")));
    expect(unplanned).toMatchObject({ plannedCents: 0, description: "Ice chest" });
    const o = await budgetOverview(db, ws.id, "2026-10-13");
    expect(o.rollup.contingency.drawn).toBe(800_00);
  });

  it("the same seller + OR number needs an explicit 'not a duplicate'", async () => {
    const { ownerPrincipal, line } = await setup();
    const first = await capture(ownerPrincipal, jpeg("e1"));
    await extractReceipt(first.receipt.id);
    const base = { vendorName: "Port Barton Hardware", docNumber: "OR 0042", date: "2026-10-12", totalCents: 500_00, method: "cash", moneyLineId: line.id, confirmed: ALL };
    expectOk(await runAction(ownerPrincipal, "receipt.confirm_existing_line", confirmInput, { ...base, receiptId: first.receipt.id }, confirmReceipt));

    const second = await capture(ownerPrincipal, jpeg("e2"));
    await extractReceipt(second.receipt.id);
    const blocked = await runAction(ownerPrincipal, "receipt.confirm_existing_line", confirmInput, { ...base, receiptId: second.receipt.id, docNumber: "0042" }, confirmReceipt);
    expect(blocked).toMatchObject({ ok: false, status: 409 });
    expectOk(await runAction(ownerPrincipal, "receipt.confirm_existing_line", confirmInput, { ...base, receiptId: second.receipt.id, docNumber: "0042", notDuplicate: true }, confirmReceipt));
  });

  it("next time, the learned vendor rule beats the AI's suggestion", async () => {
    const { ws, ownerPrincipal } = await setup();
    const [site] = await db.select().from(budgetCategory).where(and(eq(budgetCategory.workspaceId, ws.id), eq(budgetCategory.key, "site")));
    const rent = expectOk(await runAction(ownerPrincipal, "line.create", createLineInput, { categoryId: site!.id, description: "Rent", plannedCents: 30_000_00 }, createLine));
    // The fake extractor reads vendor "Port Barton Hardware (test data)" or "Sample Kitchen Supply (test data)" and suggests Equipment.
    const one = await capture(ownerPrincipal, jpeg("f1"));
    await extractReceipt(one.receipt.id);
    const [row1] = await db.select().from(receipt).where(eq(receipt.id, one.receipt.id));
    const vendor = row1!.draft!.vendorName.value!;
    expectOk(
      await runAction(ownerPrincipal, "receipt.confirm_existing_line", confirmInput, { receiptId: one.receipt.id, vendorName: vendor, date: "2026-10-12", totalCents: 100_00, method: "cash", moneyLineId: rent.id, confirmed: ALL }, confirmReceipt),
    );
    // Find a second photo the fake reads as the same vendor.
    for (let i = 0; i < 20; i++) {
      const next = await capture(ownerPrincipal, jpeg(`f2-${i}`));
      await extractReceipt(next.receipt.id);
      const [row] = await db.select().from(receipt).where(eq(receipt.id, next.receipt.id));
      if (row!.draft!.vendorName.value !== vendor) continue;
      expect(row!.suggestionSource).toBe("rule");
      expect(row!.draft!.moneyLineId).toMatchObject({ value: rent.id, source: "rule" });
      expect(row!.draft!.alternative?.categoryId).not.toBe(site!.id);
      return;
    }
    throw new Error("fake extractor never repeated the vendor");
  });

  it("a receipt the AI gave up on can be read again (not by a bookkeeper), and only then", async () => {
    const { as, ownerPrincipal } = await setup();
    const { receipt: r } = await capture(ownerPrincipal, jpeg("retry"));
    // As if the API had refused three times (e.g. a key that needs a workspace header).
    await db.update(receipt).set({ status: "extraction_failed", attempts: 3, lastError: "400 workspace header missing" }).where(eq(receipt.id, r.id));

    const bookkeeper = await as("bookkeeper");
    expect(await runAction(bookkeeper, "receipt.capture", retryExtractionInput, { receiptId: r.id }, retryExtraction)).toMatchObject({ ok: false, status: 403 });

    const helper = await as("helper");
    expectOk(await runAction(helper, "receipt.capture", retryExtractionInput, { receiptId: r.id }, retryExtraction));
    const [reset] = await db.select().from(receipt).where(eq(receipt.id, r.id));
    expect(reset).toMatchObject({ status: "uploaded", attempts: 0, lastError: null });
    const audits = await db.select().from(auditEvent).where(and(eq(auditEvent.subjectId, r.id), eq(auditEvent.action, "receipt.retry_extraction")));
    expect(audits).toHaveLength(1);

    expect(await extractReceipt(r.id)).toBe("needs_review");
    const again = await runAction(ownerPrincipal, "receipt.capture", retryExtractionInput, { receiptId: r.id }, retryExtraction);
    expect(again).toMatchObject({ ok: false, reason: expect.stringContaining("isn't waiting to be read") });
  });
});
