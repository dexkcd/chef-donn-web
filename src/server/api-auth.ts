import "server-only";
import { authenticateApiKey } from "./api-keys";
import type { Principal } from "./context";
import { getViewer } from "./viewer";

export type ApiPrincipal = { ok: true; principal: Principal } | { ok: false; status: number; reason: string };

/** API key (Authorization: Bearer cdk_…) or, failing that, the signed-in session. */
export async function apiPrincipal(req: Request): Promise<ApiPrincipal> {
  const bearer = await authenticateApiKey(req.headers.get("authorization"));
  if (bearer) return bearer;
  const v = await getViewer();
  if (v.status === "member") return { ok: true, principal: v.principal };
  return { ok: false, status: 401, reason: "Sign in, or send “Authorization: Bearer <api key>”." };
}

export function canReadPrices(p: Principal): boolean {
  if (p.actor.type === "api_key") return p.actor.scopes.includes("prices:read") || p.actor.scopes.includes("prices:search");
  return true;
}

export function apiError(status: number, reason: string, fieldErrors?: Record<string, string>): Response {
  return Response.json({ error: { reason, ...(fieldErrors ? { fieldErrors } : {}) } }, { status });
}
