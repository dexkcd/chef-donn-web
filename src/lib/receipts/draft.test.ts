import { describe, expect, it } from "vitest";
import type { ReceiptExtraction } from "../ai/receipt-types";
import { buildDraft, fingerprintOf } from "./draft";

const f = <T>(value: T | null, confidence: "high" | "medium" | "low" = "high") => ({ value, confidence });
const ex: ReceiptExtraction = {
  provider: "test",
  model: null,
  promptVersion: "t",
  extractedAt: "2026-10-13T00:00:00Z",
  docKind: "official_receipt",
  vendorName: f("Port Barton Hardware"),
  vendorTin: f("123-456-789-000"),
  vendorAddress: f(null, "low"),
  docNumber: f("OR 0042"),
  date: f("2026-10-12"),
  total: f("1,680.00"),
  vatable: f("1500.00"),
  vat: f("150.00", "medium"),
  vatExempt: f(null, "low"),
  zeroRated: f(null, "low"),
  method: f("gcash", "medium"),
  ewalletRef: f(null, "low"),
  lineItems: [],
  suggestedCategoryId: "c1",
  suggestedMoneyLineId: null,
  categoryConfidence: "medium",
  reviewerNotes: null,
};

describe("buildDraft", () => {
  it("starts every field unconfirmed, parses amounts, and flags VAT that isn't 12%", () => {
    const d = buildDraft(ex, { categoryId: "c1", moneyLineId: null, source: "ai", confidence: "medium", alternative: null }, { aiOff: false });
    expect(d.totalCents).toEqual({ value: 168000, confidence: "high", confirmed: false, source: "ai" });
    expect(d.date.value).toBe("2026-10-12");
    expect(Object.values(d).filter((v) => v && typeof v === "object" && "confirmed" in v && v.confirmed)).toHaveLength(0);
    expect(d.vatWarnings.map((w) => w.kind)).toEqual(["vat_not_12_percent", "breakdown_does_not_sum"]);
    expect(d.categoryId).toMatchObject({ value: "c1", source: "ai" });
  });

  it("drops unreadable amounts and dates instead of guessing", () => {
    const d = buildDraft({ ...ex, total: f("about 1.6k"), date: f("12/10/26") }, { categoryId: null, moneyLineId: null, source: "none", confidence: null, alternative: null }, { aiOff: false });
    expect(d.totalCents).toMatchObject({ value: null, confidence: "low", source: "none" });
    expect(d.date).toMatchObject({ value: null, confidence: "low" });
  });

  it("fingerprints by TIN when present", () => {
    const d = buildDraft(ex, { categoryId: null, moneyLineId: null, source: "none", confidence: null, alternative: null }, { aiOff: false });
    expect(fingerprintOf("r1", "abc", d)).toEqual({ id: "r1", sha256: "abc", vendorKey: "tin:123456789", docNumber: "OR 0042", totalCents: 168000, date: "2026-10-12" });
  });
});
