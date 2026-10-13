import { describe, expect, it } from "vitest";
import { normaliseVendorName, suggestCategory, vendorKey } from "./categorise";
import { duplicateSignals, needsDuplicateOverride, type ReceiptFingerprint } from "./duplicates";
import { vatCheck } from "./vat";
import { ACTIONS, can, ROLES } from "./permissions";

describe("suggestCategory", () => {
  const validCategoryIds = new Set(["equip", "site", "inventory"]);
  const validLines = new Map([
    ["fridge", "equip"],
    ["deposit", "site"],
  ]);

  it("a learned vendor rule beats the AI and keeps the AI's view as an alternative", () => {
    const s = suggestCategory({
      rule: { vendorKey: "name:port barton hardware", categoryId: "equip", moneyLineId: "fridge", hits: 3 },
      ai: { categoryId: "site", moneyLineId: "deposit", confidence: "high" },
      validCategoryIds,
      validLines,
    });
    expect(s).toMatchObject({ categoryId: "equip", moneyLineId: "fridge", source: "rule", confidence: "high" });
    expect(s.alternative).toEqual({ categoryId: "site", moneyLineId: "deposit" });
  });

  it("falls back to the AI, dropping a line that doesn't belong to the suggested category", () => {
    const s = suggestCategory({ rule: null, ai: { categoryId: "equip", moneyLineId: "deposit", confidence: "medium" }, validCategoryIds, validLines });
    expect(s).toMatchObject({ categoryId: "equip", moneyLineId: null, source: "ai" });
  });

  it("ignores ids that don't exist in this workspace", () => {
    const s = suggestCategory({
      rule: { vendorKey: "x", categoryId: "archived", moneyLineId: null, hits: 1 },
      ai: { categoryId: "made-up", moneyLineId: null, confidence: "high" },
      validCategoryIds,
      validLines,
    });
    expect(s.source).toBe("none");
  });
});

describe("vendor keys", () => {
  it("prefers the 9-digit TIN", () => {
    expect(vendorKey({ tin: "123-456-789-00000", name: "X" })).toBe("tin:123456789");
  });
  it("normalises names", () => {
    expect(normaliseVendorName("Port Barton Hardware & Supply, Inc.")).toBe("port barton hardware supply");
    expect(vendorKey({ name: "  JM  Enterprises CO. " })).toBe("name:jm enterprises");
    expect(vendorKey({})).toBeNull();
  });
});

describe("duplicateSignals", () => {
  const base: ReceiptFingerprint = { id: "new", sha256: "aaa", vendorKey: "tin:1", docNumber: "OR 000123", totalCents: 1000_00, date: "2026-10-10" };
  const existing: ReceiptFingerprint[] = [
    { id: "same-file", sha256: "aaa", vendorKey: null, docNumber: null, totalCents: null, date: null },
    { id: "same-or", sha256: "b", vendorKey: "tin:1", docNumber: "123", totalCents: 5_00, date: "2026-01-01" },
    { id: "similar", sha256: "c", vendorKey: "tin:1", docNumber: null, totalCents: 1000_00, date: "2026-10-11" },
    { id: "other-vendor", sha256: "d", vendorKey: "tin:2", docNumber: "123", totalCents: 1000_00, date: "2026-10-10" },
    { id: "far-date", sha256: "e", vendorKey: "tin:1", docNumber: null, totalCents: 1000_00, date: "2026-10-20" },
  ];

  it("ranks the three tiers and ignores other vendors", () => {
    const s = duplicateSignals(base, existing);
    expect(s).toEqual([
      { kind: "same_file", receiptId: "same-file" },
      { kind: "same_doc_number", receiptId: "same-or" },
      { kind: "similar", receiptId: "similar" },
    ]);
    expect(needsDuplicateOverride(s)).toBe(true);
    expect(needsDuplicateOverride([{ kind: "similar", receiptId: "x" }])).toBe(false);
  });
});

describe("vatCheck", () => {
  it("passes a consistent VAT breakdown", () => {
    expect(vatCheck({ totalCents: 1120_00, vatableCents: 1000_00, vatCents: 120_00, vatExemptCents: null, zeroRatedCents: null })).toEqual([]);
  });
  it("flags VAT that isn't 12% and a breakdown that doesn't sum", () => {
    const w = vatCheck({ totalCents: 1200_00, vatableCents: 1000_00, vatCents: 150_00, vatExemptCents: null, zeroRatedCents: null });
    expect(w.map((x) => x.kind)).toEqual(["vat_not_12_percent", "breakdown_does_not_sum"]);
  });
  it("is silent for a resibo with only a total", () => {
    expect(vatCheck({ totalCents: 350_00, vatableCents: null, vatCents: null, vatExemptCents: null, zeroRatedCents: null })).toEqual([]);
  });
});

describe("can()", () => {
  it("matches the spec's role matrix", () => {
    const matrix = Object.fromEntries(ROLES.map((r) => [r, ACTIONS.filter((a) => can(r, a))]));
    expect(matrix).toMatchSnapshot();
  });
  it("helpers capture and confirm receipts but never change the budget", () => {
    expect(can("helper", "receipt.capture")).toBe(true);
    expect(can("helper", "receipt.confirm_existing_line")).toBe(true);
    expect(can("helper", "receipt.confirm_new_line")).toBe(false);
    expect(can("helper", "line.edit")).toBe(false);
    expect(can("helper", "payment.void")).toBe(false);
  });
  it("bookkeepers only read and export", () => {
    expect(can("bookkeeper", "export.csv")).toBe(true);
    expect(can("bookkeeper", "receipt.capture")).toBe(false);
  });
});
