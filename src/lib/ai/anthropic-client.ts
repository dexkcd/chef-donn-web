import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/** One client per process. Only constructed when an API key is configured. */
export function anthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 });
  return client;
}

/** Server-side refusal fallback ("default" routes by refusal category). See CLAUDE.md. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
