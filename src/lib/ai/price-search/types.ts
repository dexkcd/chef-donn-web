import type { DeliveryKnown, PriceKind } from "@/domain/prices";

export interface PriceSearchContext {
  quantity?: number;
  unit?: string;
  spec?: string;
  /** Where the restaurant is, e.g. "Port Barton, San Vicente, Palawan". */
  location: string;
}

/** One price found on a real page. Amounts are centavos (parsed from decimal strings). */
export interface FoundPrice {
  item: string;
  vendor: string | null;
  unitPriceCents: number;
  unit: string | null;
  priceKind: PriceKind;
  sellerLocation: string | null;
  includesDeliveryToPalawan: DeliveryKnown;
  sourceUrl: string;
  sourceTitle: string | null;
  seenOn: string | null;
  confidence: "high" | "medium" | "low";
  notes: string | null;
}

export interface PriceSearchResult {
  provider: string;
  model: string | null;
  promptVersion: string;
  observations: FoundPrice[];
  /** Observations dropped because their source wasn't among the search results. */
  droppedUnsourced: number;
  notes: string | null;
  transcript: unknown;
}

export interface PriceSearchProvider {
  readonly name: string;
  search(input: { query: string; context: PriceSearchContext }): Promise<PriceSearchResult>;
}

export class PriceSearchUnavailableError extends Error {}
