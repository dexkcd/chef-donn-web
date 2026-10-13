/**
 * Workspace API keys for the backend hooks (price search). The key is shown once; we keep
 * only its sha256. Keys carry scopes and can be revoked at any time.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { apiKey } from "@/db/schema";
import { API_KEY_SCOPES } from "@/db/schema/prices";
import { Rejection, userIdOf, type Principal, type ServiceCtx } from "./context";

export const KEY_PREFIX = "cdk_";

export function hashKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export const createApiKeyInput = z.object({
  name: z.string().trim().min(1, "Name the key after what uses it, e.g. “n8n price refresh”.").max(80),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1, "Pick at least one permission."),
});

export async function createApiKey(ctx: ServiceCtx, input: z.output<typeof createApiKeyInput>) {
  const secret = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  const [row] = await ctx.tx
    .insert(apiKey)
    .values({
      workspaceId: ctx.workspaceId,
      name: input.name,
      prefix: secret.slice(0, 10),
      secretHash: hashKey(secret),
      scopes: input.scopes,
      createdBy: userIdOf(ctx.actor),
    })
    .returning();
  await ctx.audit({ action: "api_key.create", subjectType: "api_key", subjectId: row!.id, after: { name: row!.name, prefix: row!.prefix, scopes: row!.scopes } });
  return { ...row!, secret };
}

export async function revokeApiKey(ctx: ServiceCtx, input: { keyId: string }) {
  const [row] = await ctx.tx
    .update(apiKey)
    .set({ revokedAt: ctx.now })
    .where(and(eq(apiKey.id, input.keyId), eq(apiKey.workspaceId, ctx.workspaceId), isNull(apiKey.revokedAt)))
    .returning();
  if (!row) throw new Rejection("That key doesn't exist or is already revoked.", undefined, 404);
  await ctx.audit({ action: "api_key.revoke", subjectType: "api_key", subjectId: row.id });
  return row;
}

export type ApiAuth = { ok: true; principal: Principal } | { ok: false; status: 401 | 403; reason: string };

/** Resolve `Authorization: Bearer cdk_…`. Returns null when no bearer token was sent. */
export async function authenticateApiKey(header: string | null): Promise<ApiAuth | null> {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!m) return { ok: false, status: 401, reason: "Use “Authorization: Bearer <api key>”." };
  const secret = m[1]!;
  if (!secret.startsWith(KEY_PREFIX)) return { ok: false, status: 401, reason: "That isn't a Chef Donn's API key." };
  const [row] = await db.select().from(apiKey).where(eq(apiKey.secretHash, hashKey(secret)));
  if (!row) return { ok: false, status: 401, reason: "Unknown API key." };
  if (row.revokedAt) return { ok: false, status: 403, reason: "This API key was revoked." };
  await db.update(apiKey).set({ lastUsedAt: new Date() }).where(eq(apiKey.id, row.id));
  return { ok: true, principal: { workspaceId: row.workspaceId, actor: { type: "api_key", keyId: row.id, scopes: row.scopes } } };
}
