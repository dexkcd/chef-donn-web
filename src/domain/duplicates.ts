/**
 * Duplicate receipts are the commonest bookkeeping mistake when two people photograph the
 * same OR. Three tiers, strongest first.
 */
import { daysBetween, type LocalDate } from "./dates";
import type { Cents } from "./money";

export interface ReceiptFingerprint {
  id: string;
  sha256: string;
  vendorKey: string | null;
  docNumber: string | null;
  totalCents: Cents | null;
  date: LocalDate | null;
}

export type DuplicateSignal =
  /** Byte-identical file. Upload is blocked and the existing receipt is returned. */
  | { kind: "same_file"; receiptId: string }
  /** Same vendor and OR/SI number. Saving needs an explicit "Not a duplicate". */
  | { kind: "same_doc_number"; receiptId: string }
  /** Same vendor and total within a day. A warning only. */
  | { kind: "similar"; receiptId: string };

/** "OR No. 000123" and "123" are the same receipt; keep digits when there are any. */
const normaliseDocNumber = (n: string) => {
  const digits = n.replace(/\D/g, "").replace(/^0+/, "");
  return digits !== "" ? digits : n.replace(/[^0-9a-z]/gi, "").toUpperCase();
};

export function duplicateSignals(candidate: ReceiptFingerprint, existing: readonly ReceiptFingerprint[]): DuplicateSignal[] {
  const signals: DuplicateSignal[] = [];
  for (const other of existing) {
    if (other.id === candidate.id) continue;
    if (other.sha256 === candidate.sha256) {
      signals.push({ kind: "same_file", receiptId: other.id });
      continue;
    }
    const sameVendor = candidate.vendorKey !== null && candidate.vendorKey === other.vendorKey;
    if (!sameVendor) continue;
    if (
      candidate.docNumber &&
      other.docNumber &&
      normaliseDocNumber(candidate.docNumber) !== "" &&
      normaliseDocNumber(candidate.docNumber) === normaliseDocNumber(other.docNumber)
    ) {
      signals.push({ kind: "same_doc_number", receiptId: other.id });
      continue;
    }
    if (
      candidate.totalCents !== null &&
      candidate.totalCents === other.totalCents &&
      candidate.date &&
      other.date &&
      Math.abs(daysBetween(candidate.date, other.date)) <= 1
    ) {
      signals.push({ kind: "similar", receiptId: other.id });
    }
  }
  const rank = { same_file: 0, same_doc_number: 1, similar: 2 } as const;
  return signals.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

/** Does saving this receipt need the person to say "Not a duplicate" first? */
export function needsDuplicateOverride(signals: readonly DuplicateSignal[]): boolean {
  return signals.some((s) => s.kind === "same_doc_number" || s.kind === "same_file");
}
