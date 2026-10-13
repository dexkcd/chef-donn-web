/** Deterministic extraction for tests and demos (clearly marked as test data). */
import type { ReceiptExtraction } from "../receipt-types";
import type { ExtractionContext, ReceiptExtractor } from "./extractor";

const f = <T>(value: T | null, confidence: "high" | "medium" | "low" = "high") => ({ value, confidence });

export class FakeReceiptExtractor implements ReceiptExtractor {
  readonly name = "fake";
  async extract({ sha256, context }: { sha256: string; context: ExtractionContext }): Promise<ReceiptExtraction> {
    const equipment = context.categories.find((c) => /equipment/i.test(c.name)) ?? context.categories[0];
    const line = context.openLines.find((l) => l.categoryId === equipment?.id);
    const variant = parseInt(sha256.slice(0, 2), 16) % 2;
    return {
      provider: this.name,
      model: null,
      promptVersion: "fake.v1",
      extractedAt: new Date().toISOString(),
      docKind: "official_receipt",
      vendorName: f(variant === 0 ? "Port Barton Hardware (test data)" : "Sample Kitchen Supply (test data)"),
      vendorTin: f(variant === 0 ? "123-456-789-00000" : "987-654-321-00000", "medium"),
      vendorAddress: f("Port Barton, San Vicente, Palawan", "medium"),
      docNumber: f(`OR ${sha256.slice(0, 6)}`),
      date: f(context.today),
      total: f("1120.00"),
      vatable: f("1000.00", "medium"),
      vat: f("120.00", "medium"),
      vatExempt: f(null, "low"),
      zeroRated: f(null, "low"),
      method: f("cash", "medium"),
      ewalletRef: f(null, "low"),
      lineItems: [{ description: "Test item", qty: "1", unitPrice: "1120.00", amount: "1120.00" }],
      suggestedCategoryId: equipment?.id ?? null,
      suggestedMoneyLineId: line?.id ?? null,
      categoryConfidence: "medium",
      reviewerNotes: "Test data from the fake extractor.",
    };
  }
}
