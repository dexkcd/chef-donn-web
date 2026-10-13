/**
 * Shapes stored with a receipt. `ReceiptExtraction` is exactly what the extractor returned
 * (amounts as decimal strings, never floats); `ReceiptDraft` is the review form, where every
 * field stays unconfirmed until a person confirms it.
 */
import type { PaymentMethod } from "@/domain/budget";
import type { VatWarning } from "@/domain/vat";

export type Confidence = "high" | "medium" | "low";

export const DOC_KINDS = [
  "official_receipt",
  "sales_invoice",
  "handwritten_resibo",
  "ewallet_screenshot",
  "bank_transfer",
  "other",
] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export interface ExtractedField<T> {
  value: T | null;
  confidence: Confidence;
}

export interface ReceiptExtraction {
  provider: string;
  model: string | null;
  promptVersion: string;
  extractedAt: string;
  docKind: DocKind;
  vendorName: ExtractedField<string>;
  vendorTin: ExtractedField<string>;
  vendorAddress: ExtractedField<string>;
  docNumber: ExtractedField<string>;
  date: ExtractedField<string>;
  total: ExtractedField<string>;
  vatable: ExtractedField<string>;
  vat: ExtractedField<string>;
  vatExempt: ExtractedField<string>;
  zeroRated: ExtractedField<string>;
  method: ExtractedField<PaymentMethod>;
  ewalletRef: ExtractedField<string>;
  lineItems: { description: string; qty: string | null; unitPrice: string | null; amount: string | null }[];
  suggestedCategoryId: string | null;
  suggestedMoneyLineId: string | null;
  categoryConfidence: Confidence;
  reviewerNotes: string | null;
}

export type DraftSource = "ai" | "rule" | "person" | "none";

export interface DraftField<T> {
  value: T | null;
  confidence: Confidence | null;
  confirmed: boolean;
  source: DraftSource;
}

export interface ReceiptDraft {
  vendorName: DraftField<string>;
  vendorTin: DraftField<string>;
  docNumber: DraftField<string>;
  date: DraftField<string>;
  totalCents: DraftField<number>;
  vatableCents: DraftField<number>;
  vatCents: DraftField<number>;
  vatExemptCents: DraftField<number>;
  zeroRatedCents: DraftField<number>;
  method: DraftField<PaymentMethod>;
  categoryId: DraftField<string>;
  moneyLineId: DraftField<string>;
  /** The AI's differing opinion when a learned vendor rule won. */
  alternative: { categoryId: string; moneyLineId: string | null } | null;
  vatWarnings: VatWarning[];
  docKind: DocKind | null;
  reviewerNotes: string | null;
  aiOff: boolean;
}

/** Fields that must be confirmed before a receipt can become a payment. */
export const REQUIRED_DRAFT_FIELDS = ["date", "totalCents", "vendorName", "method", "moneyLineId"] as const;
