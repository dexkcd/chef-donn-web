/** GET /api/prices/search/:id — status, summary and every observation with its source link. */
import { db } from "@/db/client";
import { apiError, apiPrincipal, canReadPrices } from "@/server/api-auth";
import { getPriceSearch, serialisePriceSearch } from "@/server/services/prices";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await apiPrincipal(req);
  if (!auth.ok) return apiError(auth.status, auth.reason);
  if (!canReadPrices(auth.principal)) return apiError(403, "This API key can't read price searches.");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return apiError(404, "No such price search.");
  const found = await getPriceSearch(db, auth.principal.workspaceId, id);
  if (!found) return apiError(404, "No such price search.");
  return Response.json(serialisePriceSearch(found));
}
