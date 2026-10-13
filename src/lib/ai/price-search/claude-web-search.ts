/**
 * Price research with Claude + the server-side web search tool, in two calls:
 *  1. research — Claude searches (≤ max_uses) and writes up what it found, with URLs;
 *  2. structure — the write-up becomes typed JSON (no tools).
 * Every observation must cite a URL that actually came back from the searches; anything
 * else is dropped. Amounts arrive as decimal strings and are parsed to centavos.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { parsePeso } from "@/domain/money";
import { keepSourcedObservations } from "@/domain/prices";
import { anthropic, FALLBACK_BETA } from "../anthropic-client";
import { PRICE_PROMPT_VERSION, RESEARCH_SYSTEM, researchPrompt, STRUCTURE_SYSTEM } from "./prompt";
import type { FoundPrice, PriceSearchContext, PriceSearchProvider, PriceSearchResult } from "./types";

const MAX_PAUSE_RESUMES = 3;

const structuredSchema = z.object({
  observations: z.array(
    z.object({
      item: z.string(),
      vendor: z.string().nullable(),
      price_php: z.string(),
      unit: z.string().nullable(),
      price_kind: z.enum(["listed", "quoted", "delivered"]),
      seller_location: z.string().nullable(),
      includes_delivery_to_palawan: z.enum(["yes", "no", "unknown"]),
      source_url: z.string(),
      source_title: z.string().nullable(),
      seen_on: z.string().nullable(),
      confidence: z.enum(["high", "medium", "low"]),
      notes: z.string().nullable(),
    }),
  ),
  notes: z.string().nullable(),
});

export class PriceSearchFailed extends Error {}

interface SearchHit {
  url: string;
  title: string | null;
  pageAge: string | null;
}

/** Pull search-result URLs out of web_search_tool_result blocks; error results are objects, not lists. */
function collectHits(content: readonly Anthropic.Beta.Messages.BetaContentBlock[]): { hits: SearchHit[]; errors: string[] } {
  const hits: SearchHit[] = [];
  const errors: string[] = [];
  for (const block of content) {
    if (block.type !== "web_search_tool_result") continue;
    const c = block.content as unknown;
    if (Array.isArray(c)) {
      for (const r of c as { type: string; url?: string; title?: string; page_age?: string | null }[]) {
        if (r.type === "web_search_result" && r.url) hits.push({ url: r.url, title: r.title ?? null, pageAge: r.page_age ?? null });
      }
    } else if (c && typeof c === "object" && "error_code" in c) {
      errors.push(String((c as { error_code: unknown }).error_code));
    }
  }
  return { hits, errors };
}

function textOf(content: readonly Anthropic.Beta.Messages.BetaContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export class ClaudeWebSearchProvider implements PriceSearchProvider {
  readonly name = "claude_web_search";
  constructor(private readonly model: string) {}

  async search({ query, context }: { query: string; context: PriceSearchContext }): Promise<PriceSearchResult> {
    const client = anthropic();
    const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content: researchPrompt(query, context) }];
    const allContent: Anthropic.Beta.Messages.BetaContentBlock[] = [];
    let research: Anthropic.Beta.Messages.BetaMessage | null = null;

    for (let i = 0; i <= MAX_PAUSE_RESUMES; i++) {
      research = await client.beta.messages.create({
        model: this.model,
        max_tokens: 16000,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: RESEARCH_SYSTEM,
        tools: [
          {
            type: "web_search_20260209",
            name: "web_search",
            max_uses: 5,
            user_location: { type: "approximate", country: "PH", region: "Palawan", timezone: "Asia/Manila" },
          },
        ],
        messages,
      });
      allContent.push(...research.content);
      if (research.stop_reason !== "pause_turn") break;
      // A long server-tool turn paused; send it back to let Claude continue.
      messages.push({ role: "assistant", content: research.content });
    }
    if (!research) throw new PriceSearchFailed("no response");
    if (research.stop_reason === "refusal") throw new PriceSearchFailed("The model declined this search.");
    if (research.stop_reason === "max_tokens") throw new PriceSearchFailed("The research ran out of room before finishing.");
    if (research.stop_reason === "pause_turn") throw new PriceSearchFailed("The search kept pausing; try again.");

    const { hits, errors } = collectHits(allContent);
    const report = textOf(research.content);
    if (hits.length === 0) {
      throw new PriceSearchFailed(errors.length > 0 ? `Web search failed (${errors.join(", ")}).` : "The search returned no pages.");
    }

    const structured = await client.beta.messages.parse({
      model: this.model,
      max_tokens: 8000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(structuredSchema) },
      system: STRUCTURE_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Research report:\n\n${report}\n\nPages the searches returned (the only valid source URLs):\n${hits.map((h) => `- ${h.url}${h.title ? ` — ${h.title}` : ""}`).join("\n")}`,
        },
      ],
    });
    if (structured.stop_reason === "refusal") throw new PriceSearchFailed("The model declined to structure the results.");
    if (structured.stop_reason === "max_tokens") throw new PriceSearchFailed("Too many results to structure; narrow the search.");
    const parsed = structured.parsed_output;
    if (!parsed) throw new PriceSearchFailed("The results couldn't be read.");

    const candidates: FoundPrice[] = parsed.observations.flatMap((o) => {
      const cents = parsePeso(o.price_php);
      if (cents === null || cents <= 0) return [];
      const hit = hits.find((h) => h.url === o.source_url);
      return [
        {
          item: o.item,
          vendor: o.vendor,
          unitPriceCents: cents,
          unit: o.unit,
          priceKind: o.price_kind,
          sellerLocation: o.seller_location,
          includesDeliveryToPalawan: o.includes_delivery_to_palawan,
          sourceUrl: o.source_url,
          sourceTitle: o.source_title ?? hit?.title ?? null,
          seenOn: o.seen_on,
          confidence: o.confidence,
          notes: o.notes,
        },
      ];
    });
    const { kept, dropped } = keepSourcedObservations(candidates, hits.map((h) => h.url));

    return {
      provider: this.name,
      model: research.model,
      promptVersion: PRICE_PROMPT_VERSION,
      observations: kept,
      droppedUnsourced: dropped.length,
      notes: parsed.notes,
      transcript: { report, hits, searchErrors: errors, usage: { research: research.usage, structure: structured.usage } },
    };
  }
}
