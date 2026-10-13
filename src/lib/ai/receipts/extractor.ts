import type { ReceiptExtraction } from "../receipt-types";

/** What the extractor is told about this workspace, so it can suggest a category and line. */
export interface ExtractionContext {
  categories: { id: string; name: string; hint: string | null }[];
  openLines: { id: string; categoryId: string; description: string }[];
  /** Today in Manila, to resolve receipts with a 2-digit year. */
  today: string;
}

export interface ReceiptExtractor {
  readonly name: string;
  extract(input: { bytes: Uint8Array; mime: string; sha256: string; context: ExtractionContext }): Promise<ReceiptExtraction>;
}

export class ExtractionFailed extends Error {}
