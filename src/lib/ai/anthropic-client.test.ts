import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it } from "vitest";
import { env } from "@/server/env";
import { anthropicClientOptions } from "./anthropic-client";

/** Build a real SDK client from our options and capture the headers of one request. */
async function sentHeaders(): Promise<Headers> {
  let seen: Headers | null = null;
  const fetchStub = async (_url: string | URL | Request, init?: RequestInit) => {
    seen = new Headers(init?.headers);
    return new Response(JSON.stringify({ id: "claude-opus-5-5", type: "model", display_name: "Claude", created_at: "2026-01-01T00:00:00Z" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const client = new Anthropic({ ...anthropicClientOptions(), apiKey: "sk-ant-test", maxRetries: 0, fetch: fetchStub });
  await client.models.retrieve("claude-opus-5-5");
  return seen!;
}

describe("anthropic client options", () => {
  const before = env.anthropicWorkspaceId;
  afterEach(() => {
    env.anthropicWorkspaceId = before;
  });

  it("names the workspace on every request when ANTHROPIC_WORKSPACE_ID is set", async () => {
    env.anthropicWorkspaceId = "wrkspc_test";
    expect((await sentHeaders()).get("anthropic-workspace-id")).toBe("wrkspc_test");
  });

  it("sends no workspace header for workspace-scoped keys", async () => {
    env.anthropicWorkspaceId = null;
    expect((await sentHeaders()).get("anthropic-workspace-id")).toBeNull();
  });
});
