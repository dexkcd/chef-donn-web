/**
 * POST /api/prices/search — the backend hook: queue a price search.
 * Auth: `Authorization: Bearer cdk_…` (scope prices:search) or a signed-in Owner/Partner.
 * Returns 202 {id, status, pollUrl}. Idempotent on `clientId`. See docs/api.md.
 */
import { after } from "next/server";
import { runPriceSearch } from "@/server/jobs/price-search";
import { apiError, apiPrincipal } from "@/server/api-auth";
import { runAction } from "@/server/context";
import { createPriceSearch, priceSearchInput } from "@/server/services/prices";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = await apiPrincipal(req);
  if (!auth.ok) return apiError(auth.status, auth.reason);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(400, "Send a JSON body, e.g. {\"query\": \"2-door commercial chiller\"}.");
  }
  const via = auth.principal.actor.type === "api_key" ? "api" : "app";
  const r = await runAction(auth.principal, "prices.search", priceSearchInput, body, (ctx, input) => createPriceSearch(ctx, input, via));
  if (!r.ok) return apiError(r.status ?? 409, r.reason, r.fieldErrors);
  const { search, created } = r.data;
  if (search.status === "queued") after(() => runPriceSearch(search.id).catch((e) => console.error("[price-search] run failed", e)));
  return Response.json({ id: search.id, status: search.status, pollUrl: `/api/prices/search/${search.id}` }, { status: created ? 202 : 200 });
}
