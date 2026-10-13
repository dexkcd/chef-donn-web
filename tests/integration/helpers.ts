import { randomUUID } from "node:crypto";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import type { Role } from "@/domain/permissions";
import type { Principal } from "@/server/context";
import { addMember, createWorkspace } from "@/server/workspace";

export async function makeUser(email = `${randomUUID().slice(0, 8)}@example.ph`, name = "Test person") {
  const id = randomUUID();
  await db.insert(user).values({ id, email, name, emailVerified: true });
  return { id, email, name };
}

/** A workspace with an owner, plus a principal for any other role in it. */
export async function makeWorkspace(name = "Kusina sa Port Barton") {
  const owner = await makeUser(`owner-${randomUUID().slice(0, 8)}@example.ph`, "Donnrick");
  const ws = await db.transaction((tx) => createWorkspace(tx, { name, ownerUserId: owner.id }));
  const as = async (role: Role): Promise<Principal> => {
    if (role === "owner") return { workspaceId: ws.id, actor: { type: "user", userId: owner.id, role, email: owner.email, name: owner.name } };
    const u = await makeUser(undefined, role);
    await addMember(db, { workspaceId: ws.id, userId: u.id, role });
    return { workspaceId: ws.id, actor: { type: "user", userId: u.id, role, email: u.email, name: u.name } };
  };
  return { ws, owner, as, ownerPrincipal: await as("owner") };
}

export function expectOk<T>(r: { ok: true; data: T } | { ok: false; reason: string }): T {
  if (!r.ok) throw new Error(`expected ok, got rejection: ${r.reason}`);
  return r.data;
}
