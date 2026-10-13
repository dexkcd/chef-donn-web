/**
 * Turn what the extractor read into the review form. Pure: no IO. Every field starts
 * unconfirmed; amounts become centavos (unparseable → empty, low confidence); the category
 * suggestion is the vendor rule if there is one, else the AI's.
 */
import type { CategorySuggestion } from "@/domain/categorise";
import { vendorKey } from "@/domain/categorise";
import { isLocalDate } from "@/domain/dates";
import type { ReceiptFingerprint } from "@/domain/duplicates";
import { parsePeso } from "@/domain/money";
import { vatCheck } from "@/domain/vat";
import type { Confidence, DraftField, ExtractedField, ReceiptDraft, ReceiptExtraction } from "../ai/receipt-types";

function text(f: ExtractedField<string>): DraftField<string> {
  const v = f.value?.trim() || null;
  return { value: v, confidence: v ? f.confidence : null, confirmed: false, source: v ? "ai" : "none" };
}

function amount(f: ExtractedField<string>): DraftField<number> {
  const cents = f.value ? parsePeso(f.value) : null;
  if (cents === null) return { value: null, confidence: f.value ? "low" : null, confirmed: false, source: "none" };
  return { value: cents, confidence: f.confidence, confirmed: false, source: "ai" };
}

function date(f: ExtractedField<string>): DraftField<string> {
  const v = f.value?.trim() ?? null;
  if (!v || !isLocalDate(v)) return { value: null, confidence: v ? "low" : null, confirmed: false, source: "none" };
  return { value: v, confidence: f.confidence, confirmed: false, source: "ai" };
}

export function emptyField<T>(): DraftField<T> {
  return { value: null, confidence: null, confirmed: false, source: "none" };
}

export function buildDraft(ex: ReceiptExtraction, suggestion: CategorySuggestion, opts: { aiOff: boolean }): ReceiptDraft {
  const totalCents = amount(ex.total);
  const vatableCents = amount(ex.vatable);
  const vatCents = amount(ex.vat);
  const vatExemptCents = amount(ex.vatExempt);
  const zeroRatedCents = amount(ex.zeroRated);
  const suggestionConfidence: Confidence | null = suggestion.source === "none" ? null : (suggestion.confidence ?? ex.categoryConfidence);
  return {
    vendorName: text(ex.vendorName),
    vendorTin: text(ex.vendorTin),
    docNumber: text(ex.docNumber),
    date: date(ex.date),
    totalCents,
    vatableCents,
    vatCents,
    vatExemptCents,
    zeroRatedCents,
    method: ex.method.value ? { value: ex.method.value, confidence: ex.method.confidence, confirmed: false, source: "ai" } : emptyField(),
    categoryId: { value: suggestion.categoryId, confidence: suggestionConfidence, confirmed: false, source: suggestion.source === "none" ? "none" : suggestion.source },
    moneyLineId: { value: suggestion.moneyLineId, confidence: suggestion.moneyLineId ? suggestionConfidence : null, confirmed: false, source: suggestion.moneyLineId ? suggestion.source : "none" },
    alternative: suggestion.alternative,
    vatWarnings: vatCheck({
      totalCents: totalCents.value,
      vatableCents: vatableCents.value,
      vatCents: vatCents.value,
      vatExemptCents: vatExemptCents.value,
      zeroRatedCents: zeroRatedCents.value,
    }),
    docKind: ex.docKind,
    reviewerNotes: ex.reviewerNotes,
    aiOff: opts.aiOff,
  };
}

export function emptyDraft(opts: { aiOff: boolean }): ReceiptDraft {
  return {
    vendorName: emptyField(),
    vendorTin: emptyField(),
    docNumber: emptyField(),
    date: emptyField(),
    totalCents: emptyField(),
    vatableCents: emptyField(),
    vatCents: emptyField(),
    vatExemptCents: emptyField(),
    zeroRatedCents: emptyField(),
    method: emptyField(),
    categoryId: emptyField(),
    moneyLineId: emptyField(),
    alternative: null,
    vatWarnings: [],
    docKind: null,
    reviewerNotes: null,
    aiOff: opts.aiOff,
  };
}

/** The bits of a draft used to spot duplicates. */
export function fingerprintOf(id: string, sha256: string, d: Pick<ReceiptDraft, "vendorName" | "vendorTin" | "docNumber" | "totalCents" | "date">): ReceiptFingerprint {
  return {
    id,
    sha256,
    vendorKey: vendorKey({ tin: d.vendorTin.value, name: d.vendorName.value }),
    docNumber: d.docNumber.value,
    totalCents: d.totalCents.value,
    date: d.date.value,
  };
}
