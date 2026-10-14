import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk";
import { env } from "@/server/env";

let client: Anthropic | null = null;

/**
 * An API key that isn't created inside an Anthropic workspace must name one on every request
 * (`anthropic-workspace-id`), or the API answers 400. Workspace-scoped keys need nothing.
 */
export function anthropicClientOptions(): ClientOptions {
  return {
    apiKey: env.anthropicApiKey ?? undefined,
    maxRetries: 2,
    timeout: 120_000,
    ...(env.anthropicWorkspaceId ? { defaultHeaders: { "anthropic-workspace-id": env.anthropicWorkspaceId } } : {}),
  };
}

/** One client per process. Only constructed when an API key is configured. */
export function anthropic(): Anthropic {
  client ??= new Anthropic(anthropicClientOptions());
  return client;
}

/** Server-side refusal fallback ("default" routes by refusal category). See CLAUDE.md. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
