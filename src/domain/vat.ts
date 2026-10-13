/**
 * Philippine VAT sanity checks for a receipt draft. VAT is 12% of VATable sales; a VAT
 * breakdown should add up to the total. These are warnings for the reviewer, not blockers —
 * plenty of valid resibos have no breakdown at all.
 */
import { mulBp, type Cents } from "./money";

export const PH_VAT_BP = 1200;
const TOLERANCE: Cents = 100; // ₱1 — receipts round per line

export interface VatFigures {
  totalCents: Cents | null;
  vatableCents: Cents | null;
  vatCents: Cents | null;
  vatExemptCents: Cents | null;
  zeroRatedCents: Cents | null;
}

export type VatWarning =
  | { kind: "vat_not_12_percent"; expected: Cents; actual: Cents }
  | { kind: "breakdown_does_not_sum"; expected: Cents; actual: Cents };

export function vatCheck(f: VatFigures): VatWarning[] {
  const warnings: VatWarning[] = [];
  if (f.vatableCents !== null && f.vatCents !== null) {
    const expected = mulBp(f.vatableCents, PH_VAT_BP);
    if (Math.abs(expected - f.vatCents) > TOLERANCE) {
      warnings.push({ kind: "vat_not_12_percent", expected, actual: f.vatCents });
    }
  }
  const parts = [f.vatableCents, f.vatCents, f.vatExemptCents, f.zeroRatedCents];
  if (f.totalCents !== null && parts.some((p) => p !== null)) {
    const sum = parts.reduce<number>((acc, p) => acc + (p ?? 0), 0);
    if (Math.abs(sum - f.totalCents) > TOLERANCE) {
      warnings.push({ kind: "breakdown_does_not_sum", expected: f.totalCents, actual: sum });
    }
  }
  return warnings;
}

export function describeVatWarning(w: VatWarning): string {
  switch (w.kind) {
    case "vat_not_12_percent":
      return "VAT isn't 12% of VATable sales — check both figures.";
    case "breakdown_does_not_sum":
      return "VATable + VAT + exempt + zero-rated doesn't add up to the total.";
  }
}
