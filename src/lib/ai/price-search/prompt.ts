import type { PriceSearchContext } from "./types";

export const PRICE_PROMPT_VERSION = "price-search.v1";

export const RESEARCH_SYSTEM = `You research current prices in the Philippines for a first-time restaurant owner who is building a restaurant. You use web search, then report what you found.

Rules:
- Report prices in Philippine pesos (PHP) exactly as written on the page. Never estimate, average or invent a price. If a page shows no price, don't report it.
- Prefer sellers that deliver in the Philippines: Lazada PH, Shopee PH, Philippine suppliers and distributors, stores in Manila, Puerto Princesa or elsewhere in Palawan.
- For each price, say whether it already includes delivery to Palawan, excludes it, or the page doesn't say.
- Say what kind of price it is: a listed retail price, a quoted/contact-for-price figure that the page actually states, or a delivered price.
- Include the exact page URL you got each price from. Use only URLs returned by your searches.
- 3 to 8 prices from different sellers is ideal. Fewer honest results beat many weak ones.
- If you find nothing reliable, say so plainly.

Finish with a short plain-text list, one price per line: item — vendor — PHP amount — unit — kind — delivery to Palawan (yes/no/unknown) — seller location — URL.`;

export function researchPrompt(query: string, ctx: PriceSearchContext): string {
  const parts = [`Find current prices for: ${query}`];
  if (ctx.spec) parts.push(`Specification: ${ctx.spec}`);
  if (ctx.quantity) parts.push(`Quantity needed: ${ctx.quantity}${ctx.unit ? ` ${ctx.unit}` : ""} (report the price per unit).`);
  parts.push(`The restaurant is in ${ctx.location}. Delivery there usually goes through Puerto Princesa.`);
  return parts.join("\n");
}

export const STRUCTURE_SYSTEM = `You convert a price-research report into JSON. Copy values exactly from the report; never add a price, vendor or URL that the report doesn't contain. Amounts are decimal strings in PHP without currency symbols or thousands separators (e.g. "45999.00"). Use null when the report doesn't say.`;
