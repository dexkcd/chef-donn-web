/**
 * Price observations found online → one honest range. We compute the summary ourselves
 * from the individual observations; numbers the model "summarises" are never trusted.
 */
import { roundToHundredPesos, type Cents } from "./money";

export type PriceKind = "listed" | "quoted" | "delivered";
export type DeliveryKnown = "yes" | "no" | "unknown";

export interface PriceObservationInput {
  unitPriceCents: Cents;
  priceKind: PriceKind;
  includesDeliveryToPalawan: DeliveryKnown;
}

export interface PriceSummary {
  low: Cents;
  typical: Cents;
  high: Cents;
  /** Observations found. */
  count: number;
  /** Observations the range is built from. */
  used: number;
  outliersDropped: number;
  /** "delivered" when enough prices already include delivery to Palawan. */
  basis: "delivered" | "all";
  quantity: number;
}

const deliveredToPalawan = (o: PriceObservationInput) => o.priceKind === "delivered" || o.includesDeliveryToPalawan === "yes";

function median(sorted: readonly Cents[]): Cents {
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** Median and range after dropping prices more than 3× or under ⅓ of the median. */
export function summarisePrices(
  observations: readonly PriceObservationInput[],
  opts: { quantity?: number } = {},
): PriceSummary | null {
  const valid = observations.filter((o) => Number.isSafeInteger(o.unitPriceCents) && o.unitPriceCents > 0);
  if (valid.length === 0) return null;
  const delivered = valid.filter(deliveredToPalawan);
  const basis = delivered.length >= 2 ? "delivered" : "all";
  const pool = (basis === "delivered" ? delivered : valid).map((o) => o.unitPriceCents).sort((a, b) => a - b);
  const m = median(pool);
  const kept = pool.filter((p) => p <= m * 3 && p * 3 >= m);
  return {
    low: kept[0]!,
    typical: median(kept),
    high: kept[kept.length - 1]!,
    count: valid.length,
    used: kept.length,
    outliersDropped: pool.length - kept.length,
    basis,
    quantity: opts.quantity ?? 1,
  };
}

/** The estimate a person would apply: typical × quantity, rounded to ₱100. */
export function estimateFromPrices(summary: PriceSummary): Cents {
  return roundToHundredPesos(summary.typical * summary.quantity);
}

/** Compare URLs loosely: ignore scheme case, trailing slashes, fragments and tracking params. */
export function normaliseUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.hash = "";
    for (const p of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|spm)/i.test(p)) u.searchParams.delete(p);
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${path}${u.search}`;
  } catch {
    return null;
  }
}

/**
 * Keep only observations whose source actually appeared in the web-search results for
 * this search — a price without a real page behind it is dropped, not shown.
 */
export function keepSourcedObservations<T extends { sourceUrl: string }>(
  observations: readonly T[],
  resultUrls: readonly string[],
): { kept: T[]; dropped: T[] } {
  const known = new Set(resultUrls.map(normaliseUrl).filter((u): u is string => u !== null));
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const o of observations) {
    const n = normaliseUrl(o.sourceUrl);
    (n !== null && known.has(n) ? kept : dropped).push(o);
  }
  return { kept, dropped };
}
