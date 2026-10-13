import { env } from "@/server/env";
import type { ReceiptExtraction } from "../receipt-types";
import { AnthropicReceiptExtractor } from "./anthropic";
import type { ReceiptExtractor } from "./extractor";
import { FakeReceiptExtractor } from "./fake";

const none = <T>() => ({ value: null as T | null, confidence: "low" as const });

/** No API key: the receipt goes straight to review with empty fields and an "AI reading is off" note. */
class NullReceiptExtractor implements ReceiptExtractor {
  readonly name = "null";
  async extract(): Promise<ReceiptExtraction> {
    return {
      provider: this.name,
      model: null,
      promptVersion: "none",
      extractedAt: new Date().toISOString(),
      docKind: "other",
      vendorName: none(),
      vendorTin: none(),
      vendorAddress: none(),
      docNumber: none(),
      date: none(),
      total: none(),
      vatable: none(),
      vat: none(),
      vatExempt: none(),
      zeroRated: none(),
      method: none(),
      ewalletRef: none(),
      lineItems: [],
      suggestedCategoryId: null,
      suggestedMoneyLineId: null,
      categoryConfidence: "low",
      reviewerNotes: null,
    };
  }
}

export function receiptExtractor(): ReceiptExtractor {
  const choice = env.aiExtractor ?? (env.anthropicApiKey ? "anthropic" : "null");
  if (choice === "fake") return new FakeReceiptExtractor();
  if (choice === "anthropic" && env.anthropicApiKey) return new AnthropicReceiptExtractor(env.receiptModel);
  return new NullReceiptExtractor();
}
