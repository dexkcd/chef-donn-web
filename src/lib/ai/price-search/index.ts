import { env } from "@/server/env";
import { ClaudeWebSearchProvider } from "./claude-web-search";
import { FakePriceSearchProvider } from "./fake";
import { PriceSearchUnavailableError, type PriceSearchProvider } from "./types";

class NullPriceSearchProvider implements PriceSearchProvider {
  readonly name = "null";
  async search(): Promise<never> {
    throw new PriceSearchUnavailableError("Price search is off — set ANTHROPIC_API_KEY to turn it on.");
  }
}

export function priceSearchProvider(): PriceSearchProvider {
  const choice = env.priceProvider ?? (env.anthropicApiKey ? "anthropic" : "null");
  if (choice === "fake") return new FakePriceSearchProvider();
  if (choice === "anthropic" && env.anthropicApiKey) return new ClaudeWebSearchProvider(env.priceModel);
  return new NullPriceSearchProvider();
}
