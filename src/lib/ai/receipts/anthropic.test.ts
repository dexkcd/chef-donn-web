import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describe, expect, it } from "vitest";
import { structuredSchema } from "../price-search/claude-web-search";
import { countUnionParams, MAX_UNION_PARAMS } from "../schema-limits";
import type { ExtractionContext } from "./extractor";
import { schemaFor, toExtraction, type ReceiptOutput } from "./anthropic";

const ctx = (lines: number): ExtractionContext => ({
  categories: Array.from({ length: 13 }, (_, i) => ({ id: `cat-${i + 1}`, name: `Category ${i + 1}`, hint: null })),
  openLines: Array.from({ length: lines }, (_, i) => ({ id: `line-${i + 1}`, categoryId: "cat-3", description: `Line ${i + 1}` })),
  today: "2026-10-14",
});

/** What the API receives — the same conversion the extractor uses. */
const sent = (schema: Parameters<typeof betaZodOutputFormat>[0]) => betaZodOutputFormat(schema).schema;

describe("structured-output schemas stay within the API's union limit", () => {
  it("the receipt schema has no union-typed parameters, with or without open lines", () => {
    expect(countUnionParams(sent(schemaFor(ctx(30))))).toBe(0);
    expect(countUnionParams(sent(schemaFor(ctx(0))))).toBe(0);
  });

  it("the price-search schema is under the limit", () => {
    expect(countUnionParams(sent(structuredSchema))).toBeLessThanOrEqual(MAX_UNION_PARAMS);
  });

  it("counts type arrays and anyOf", () => {
    expect(countUnionParams({ type: "object", properties: { a: { type: ["string", "null"] }, b: { anyOf: [{ type: "string" }, { type: "number" }] }, c: { type: "string" } } })).toBe(2);
  });
});

describe("toExtraction", () => {
  const t = (value: string, confidence: "high" | "medium" | "low" = "high") => ({ value, confidence });
  const output: ReceiptOutput = {
    doc_kind: "official_receipt",
    vendor_name: t("  Port Barton Hardware "),
    vendor_tin: t("", "low"),
    vendor_address: t(""),
    doc_number: t("0012345"),
    date: t("2026-10-12"),
    total: t("1120.00"),
    vatable_sales: t("1000.00"),
    vat: t("120.00"),
    vat_exempt: t(""),
    zero_rated: t(""),
    payment_method: { value: "unknown", confidence: "low" },
    ewallet_reference: t(""),
    line_items: [{ description: "Grease trap", qty: "1", unit_price: "", amount: "1120.00" }],
    category_code: "C3",
    line_code: "L2",
    category_confidence: "medium",
    reviewer_notes: "",
  };

  it("turns the 'not on the receipt' values back into null", () => {
    const x = toExtraction(output, ctx(5), "claude-opus-5-5");
    expect(x.vendorName).toEqual({ value: "Port Barton Hardware", confidence: "high" });
    expect(x.vendorTin).toEqual({ value: null, confidence: "low" });
    expect(x.method).toEqual({ value: null, confidence: "low" });
    expect(x.lineItems).toEqual([{ description: "Grease trap", qty: "1", unitPrice: null, amount: "1120.00" }]);
    expect(x.reviewerNotes).toBeNull();
    expect(x).toMatchObject({ total: { value: "1120.00" }, model: "claude-opus-5-5", promptVersion: "receipt.v2" });
  });

  it("maps category and line codes to this workspace's ids, and 'none' to no suggestion", () => {
    expect(toExtraction(output, ctx(5), null)).toMatchObject({ suggestedCategoryId: "cat-3", suggestedMoneyLineId: "line-2" });
    expect(toExtraction({ ...output, category_code: "none", line_code: "none", payment_method: { value: "gcash", confidence: "high" } }, ctx(5), null)).toMatchObject({
      suggestedCategoryId: null,
      suggestedMoneyLineId: null,
      method: { value: "gcash" },
    });
  });
});
