/** GET /api/prices/searches?subjectType=task&subjectId=… — recent searches (summaries, no observations). */
import { db } from "@/db/client";
import { apiError, apiPrincipal, canReadPrices } from "@/server/api-auth";
import { getPriceSearch, listPriceSearches, serialisePriceSearch } from "@/server/services/prices";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await apiPrincipal(req);
  if (!auth.ok) return apiError(auth.status, auth.reason);
  if (!canReadPrices(auth.principal)) return apiError(403, "This API key can't read price searches.");
  const url = new URL(req.url);
  const subjectType = url.searchParams.get("subjectType");
  const subjectId = url.searchParams.get("subjectId");
  if ((subjectType && !subjectId) || (subjectId && !subjectType)) return apiError(422, "Send both subjectType and subjectId, or neither.");
  if (subjectType && !["task", "money_line"].includes(subjectType)) return apiError(422, "subjectType must be task or money_line.");
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20) || 20));
  const rows = await listPriceSearches(db, auth.principal.workspaceId, subjectType && subjectId ? { type: subjectType, id: subjectId } : undefined, limit);
  const full = await Promise.all(rows.map((r) => getPriceSearch(db, auth.principal.workspaceId, r.id)));
  return Response.json({
    searches: full.filter((f) => f !== null).map((f) => {
      const { observations: _omit, ...rest } = serialisePriceSearch(f);
      return rest;
    }),
  });
}
