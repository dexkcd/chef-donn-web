/**
 * POST /api/receipts — receipt upload from the phone (multipart: clientId, file, note).
 * Idempotent on clientId, so the offline outbox can retry safely. Byte-identical files are
 * not stored twice: the existing receipt comes back with `duplicateOf`.
 */
import { after } from "next/server";
import { apiError } from "@/server/api-auth";
import { runAction } from "@/server/context";
import { extractReceipt } from "@/server/jobs/extraction";
import { captureInput, captureReceipt } from "@/server/services/receipts";
import { getViewer } from "@/server/viewer";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const v = await getViewer();
  if (v.status !== "member") return apiError(401, "Sign in to upload receipts.");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError(400, "Send the receipt as a multipart form.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return apiError(422, "Attach the receipt photo.", { file: "Attach a photo." });
  const raw = {
    clientId: form.get("clientId"),
    mime: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
    name: file.name || null,
    note: typeof form.get("note") === "string" ? (form.get("note") as string) : null,
  };
  const r = await runAction(v.principal, "receipt.capture", captureInput, raw, captureReceipt);
  if (!r.ok) return apiError(r.status ?? 409, r.reason, r.fieldErrors);
  const { receipt, duplicateOf, replayed } = r.data;
  if (receipt.status === "uploaded") after(() => extractReceipt(receipt.id).catch((e) => console.error("[receipts] extraction failed", e)));
  return Response.json({ id: receipt.id, status: receipt.status, duplicateOf, replayed }, { status: duplicateOf || replayed ? 200 : 201 });
}
