"use server";

import { after } from "next/server";
import { z } from "zod";
import type { FormState } from "@/ui/form";
import { createApiKey, createApiKeyInput, revokeApiKey } from "../api-keys";
import { runPriceSearch } from "../jobs/price-search";
import { applyPriceEstimate, applyPriceInput, createPriceSearch, priceSearchInput } from "../services/prices";
import { act } from "../viewer";
import { int, peso, str, toFormState } from "./form";
import { newWebhookSecret } from "../workspace";
import { workspace } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function startPriceSearchAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const quantity = int(fd, "quantity");
  const subjectType = str(fd, "subjectType");
  const r = await act(
    "prices.search",
    priceSearchInput,
    {
      query: str(fd, "query"),
      subject: subjectType && subjectType !== "none" ? { type: subjectType, id: str(fd, "subjectId") } : null,
      context: quantity ? { quantity } : undefined,
    },
    (ctx, input) => createPriceSearch(ctx, input, "app"),
  );
  if (r.ok && r.data.search.status === "queued") {
    const id = r.data.search.id;
    after(() => runPriceSearch(id).catch((e) => console.error("[price-search] run failed", e)));
  }
  return toFormState(r, "Searching — results appear here in a minute or two.");
}

export async function applyPriceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act(
    "prices.apply",
    applyPriceInput,
    { priceSearchId: str(fd, "priceSearchId"), estimateCents: peso(fd, "estimate"), categoryKey: str(fd, "categoryKey") || undefined },
    applyPriceEstimate,
  );
  return toFormState(r, "Applied — the budget moved with it.");
}

export interface ApiKeyFormState extends FormState {
  secret?: string;
}

export async function createApiKeyAction(_prev: ApiKeyFormState, fd: FormData): Promise<ApiKeyFormState> {
  const r = await act("api_keys.manage", createApiKeyInput, { name: str(fd, "name"), scopes: fd.getAll("scopes").map(String) }, createApiKey);
  const state = toFormState(r, "Key created. Copy it now — it won't be shown again.");
  return r.ok ? { ...state, secret: r.data.secret } : state;
}

export async function revokeApiKeyAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return toFormState(await act("api_keys.manage", z.object({ keyId: z.uuid() }), { keyId: str(fd, "keyId") }, revokeApiKey), "Key revoked.");
}

export async function rotateWebhookSecretAction(_prev: FormState, _fd: FormData): Promise<FormState> {
  const r = await act("api_keys.manage", z.object({}), {}, async (ctx) => {
    await ctx.tx.update(workspace).set({ webhookSecret: newWebhookSecret() }).where(eq(workspace.id, ctx.workspaceId));
    await ctx.audit({ action: "webhook_secret.rotate", subjectType: "workspace", subjectId: ctx.workspaceId });
  });
  return toFormState(r, "New signing secret created. Update your receivers.");
}
