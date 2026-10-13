import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Executor } from "@/db/client";
import { budgetCategory, membership, restaurantProfile, workspace } from "@/db/schema";
import { DEFAULT_CATEGORIES } from "@/db/seed/categories";
import type { Role } from "@/domain/permissions";

export function newWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

/** A new restaurant workspace with its owner, default categories and an empty profile. */
export async function createWorkspace(tx: Executor, args: { name: string; ownerUserId: string }) {
  const [ws] = await tx.insert(workspace).values({ name: args.name, webhookSecret: newWebhookSecret() }).returning();
  if (!ws) throw new Error("workspace insert failed");
  await tx.insert(membership).values({ workspaceId: ws.id, userId: args.ownerUserId, role: "owner" });
  await tx.insert(restaurantProfile).values({ workspaceId: ws.id, name: args.name });
  await tx.insert(budgetCategory).values(
    DEFAULT_CATEGORIES.map((c, i) => ({ workspaceId: ws.id, key: c.key, name: c.name, hint: c.hint, kind: c.kind, sort: (i + 1) * 10 })),
  );
  return ws;
}

export async function addMember(tx: Executor, args: { workspaceId: string; userId: string; role: Role }) {
  await tx.insert(membership).values(args).onConflictDoNothing();
}

export async function getWorkspace(tx: Executor, workspaceId: string) {
  const [ws] = await tx.select().from(workspace).where(eq(workspace.id, workspaceId));
  return ws ?? null;
}
