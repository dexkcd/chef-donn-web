/**
 * Deterministic results for tests and local demos — clearly labelled as test data, with
 * example.com sources, so they can never be mistaken for real prices.
 */
import { keepSourcedObservations } from "@/domain/prices";
import { PRICE_PROMPT_VERSION } from "./prompt";
import type { FoundPrice, PriceSearchProvider, PriceSearchResult } from "./types";

function seed(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Math.abs(h);
}

export class FakePriceSearchProvider implements PriceSearchProvider {
  readonly name = "fake";

  async search({ query }: { query: string }): Promise<PriceSearchResult> {
    if (/\bnothing\b/i.test(query)) {
      return { provider: this.name, model: null, promptVersion: PRICE_PROMPT_VERSION, observations: [], droppedUnsourced: 0, notes: "No prices found (test data).", transcript: null };
    }
    if (/\bexplode\b/i.test(query)) throw new Error("fake provider failure");
    const base = 10_000 + (seed(query) % 90) * 1_000; // ₱10,000 – ₱99,000
    const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    const make = (i: number, factor: number, kind: FoundPrice["priceKind"], delivery: FoundPrice["includesDeliveryToPalawan"], vendor: string, where: string): FoundPrice => ({
      item: `${query} (test data)`,
      vendor,
      unitPriceCents: Math.round(base * factor) * 100,
      unit: "piece",
      priceKind: kind,
      sellerLocation: where,
      includesDeliveryToPalawan: delivery,
      sourceUrl: `https://example.com/${slug}/${i}`,
      sourceTitle: `${vendor} — ${query}`,
      seenOn: "2026-10-13",
      confidence: "medium",
      notes: "Test data from the fake provider.",
    });
    const all = [
      make(1, 0.95, "listed", "no", "Sample Supply Manila", "Manila"),
      make(2, 1.0, "listed", "unknown", "Sample Online Store", "Online"),
      make(3, 1.12, "delivered", "yes", "Sample Palawan Trading", "Puerto Princesa"),
      make(4, 4.5, "listed", "no", "Sample Premium Brand", "Manila"),
      { ...make(5, 1.0, "listed", "no", "Unsourced Seller", "Nowhere"), sourceUrl: "https://not-in-results.example.org/x" },
    ];
    const resultUrls = all.slice(0, 4).map((o) => o.sourceUrl);
    const { kept, dropped } = keepSourcedObservations(all, resultUrls);
    return { provider: this.name, model: null, promptVersion: PRICE_PROMPT_VERSION, observations: kept, droppedUnsourced: dropped.length, notes: "Test data.", transcript: { fake: true } };
  }
}
