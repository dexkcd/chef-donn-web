/** The receipt image, for signed-in members of its workspace only. */
import { db } from "@/db/client";
import { apiError } from "@/server/api-auth";
import { getReceipt } from "@/server/services/receipts";
import { storage } from "@/server/storage";
import { getViewer } from "@/server/viewer";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViewer();
  if (v.status !== "member") return apiError(401, "Sign in to see receipts.");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return apiError(404, "No such receipt.");
  const row = await getReceipt(db, v.principal.workspaceId, id);
  if (!row) return apiError(404, "No such receipt.");
  const bytes = await storage().get(row.d.storageKey);
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": row.d.mime,
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
    },
  });
}
