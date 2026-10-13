/**
 * POST /api/sync — replays one queued offline write {kind, clientId, payload}. Each kind
 * dedupes on clientId, so a retry after a dropped connection never doubles a write.
 */
import { z } from "zod";
import { apiError } from "@/server/api-auth";
import { runAction } from "@/server/context";
import { claimClientId, logPayment, logPaymentInput, recordClientResult } from "@/server/services/budget";
import { setTaskStatus, taskStatusInput } from "@/server/services/roadmap";
import { getViewer } from "@/server/viewer";

export const dynamic = "force-dynamic";

const envelope = z.object({ kind: z.string(), clientId: z.uuid(), payload: z.record(z.string(), z.unknown()) });

export async function POST(req: Request) {
  const v = await getViewer();
  if (v.status !== "member") return apiError(401, "Sign in to sync.");
  const parsed = envelope.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Malformed sync request.");
  const { kind, clientId, payload } = parsed.data;

  switch (kind) {
    case "payment.log": {
      const r = await runAction(v.principal, "payment.log", logPaymentInput, { ...payload, clientId }, logPayment);
      return r.ok ? Response.json({ id: r.data.id }) : apiError(r.status ?? 409, r.reason, r.fieldErrors);
    }
    case "task.setStatus": {
      const r = await runAction(v.principal, "task.set_status", taskStatusInput, { ...payload, clientId }, async (ctx, input) => {
        const prior = await claimClientId(ctx, clientId, kind);
        if (prior) return { id: prior };
        const t = await setTaskStatus(ctx, input);
        await recordClientResult(ctx, clientId, t.id);
        return { id: t.id };
      });
      return r.ok ? Response.json(r.data) : apiError(r.status ?? 409, r.reason, r.fieldErrors);
    }
    default:
      return apiError(422, `This app version can't sync “${kind}”. Update the app.`);
  }
}
