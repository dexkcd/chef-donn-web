import { describe, expect, it } from "vitest";
import { estimateFromPrices, keepSourcedObservations, normaliseUrl, summarisePrices, type PriceObservationInput } from "./prices";

const obs = (pesos: number, priceKind: PriceObservationInput["priceKind"] = "listed", delivery: PriceObservationInput["includesDeliveryToPalawan"] = "unknown"): PriceObservationInput => ({
  unitPriceCents: pesos * 100,
  priceKind,
  includesDeliveryToPalawan: delivery,
});

describe("summarisePrices", () => {
  it("returns null when nothing was found", () => {
    expect(summarisePrices([])).toBeNull();
    expect(summarisePrices([obs(0)])).toBeNull();
  });

  it("uses the median and drops outliers beyond 3× / under ⅓", () => {
    const s = summarisePrices([obs(30_000), obs(32_000), obs(35_000), obs(150_000), obs(5_000)])!;
    expect(s).toMatchObject({ typical: 32_000_00, low: 30_000_00, high: 35_000_00, count: 5, used: 3, outliersDropped: 2, basis: "all" });
  });

  it("averages the middle pair for an even count", () => {
    expect(summarisePrices([obs(100), obs(200)])!.typical).toBe(150_00);
  });

  it("prefers prices that already include delivery to Palawan when there are at least two", () => {
    const s = summarisePrices([obs(20_000), obs(21_000), obs(26_000, "delivered"), obs(27_000, "listed", "yes")])!;
    expect(s).toMatchObject({ basis: "delivered", low: 26_000_00, high: 27_000_00, used: 2, count: 4 });
  });

  it("estimates typical × quantity rounded to ₱100", () => {
    const s = summarisePrices([obs(1_234), obs(1_250), obs(1_260)], { quantity: 3 })!;
    expect(estimateFromPrices(s)).toBe(3_800_00);
  });
});

describe("sourced observations", () => {
  it("normalises URLs", () => {
    expect(normaliseUrl("https://www.Lazada.com.ph/products/chiller/?utm_source=x#top")).toBe("lazada.com.ph/products/chiller");
    expect(normaliseUrl("ftp://x")).toBeNull();
    expect(normaliseUrl("not a url")).toBeNull();
  });

  it("drops observations whose source wasn't in the search results", () => {
    const { kept, dropped } = keepSourcedObservations(
      [{ sourceUrl: "https://shopee.ph/item/1" }, { sourceUrl: "https://made-up.example/price" }],
      ["https://shopee.ph/item/1/"],
    );
    expect(kept).toHaveLength(1);
    expect(dropped.map((d) => d.sourceUrl)).toEqual(["https://made-up.example/price"]);
  });
});
