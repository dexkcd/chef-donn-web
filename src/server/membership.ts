/**
 * Who belongs where. One workspace per restaurant; people get in by invitation, except the
 * very first owner, named by BOOTSTRAP_OWNER_EMAIL, who creates the workspace on first login.
 */
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { db, type Executor } from "@/db/client";
import { invitation, membership, user, workspace } from "@/db/schema";
import type { Role } from "@/domain/permissions";
import { env } from "./env";
import { addMember, createWorkspace } from "./workspace";

const normalise = (email: string) => email.trim().toLowerCase();

async function pendingInvitation(tx: Executor, email: string) {
  const [inv] = await tx
    .select()
    .from(invitation)
    .where(
      and(
        sql`lower(${invitation.email}) = ${normalise(email)}`,
        isNull(invitation.acceptedAt),
        isNull(invitation.revokedAt),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(invitation.createdAt))
    .limit(1);
  return inv ?? null;
}

async function anyWorkspaceExists(tx: Executor): Promise<boolean> {
  const rows = await tx.select({ id: workspace.id }).from(workspace).limit(1);
  return rows.length > 0;
}

/** Invited, already a member, or the bootstrap owner before any workspace exists. */
export async function mayReceiveSignInLink(email: string, tx: Executor = db): Promise<boolean> {
  const e = normalise(email);
  if (await pendingInvitation(tx, e)) return true;
  const existing = await tx
    .select({ id: membership.id })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(sql`lower(${user.email}) = ${e}`)
    .limit(1);
  if (existing.length > 0) return true;
  return env.bootstrapOwnerEmail === e && !(await anyWorkspaceExists(tx));
}

export interface MembershipInfo {
  workspaceId: string;
  workspaceName: string;
  role: Role;
}

/**
 * The signed-in user's membership. Accepts a pending invitation, or bootstraps the first
 * workspace for BOOTSTRAP_OWNER_EMAIL. Returns null when the person has no access.
 */
export async function resolveMembership(userId: string, email: string): Promise<MembershipInfo | null> {
  return db.transaction(async (tx) => {
    const current = await currentMembership(tx, userId);
    if (current) return current;

    const inv = await pendingInvitation(tx, email);
    if (inv) {
      await addMember(tx, { workspaceId: inv.workspaceId, userId, role: inv.role });
      await tx.update(invitation).set({ acceptedAt: new Date() }).where(eq(invitation.id, inv.id));
      return currentMembership(tx, userId);
    }

    if (env.bootstrapOwnerEmail === normalise(email)) {
      // Serialise bootstrap so two first logins can't create two workspaces.
      await tx.execute(sql`select pg_advisory_xact_lock(4242001)`);
      // A concurrent first login may have just created it for this same person.
      const raced = await currentMembership(tx, userId);
      if (raced) return raced;
      if (!(await anyWorkspaceExists(tx))) {
        await createWorkspace(tx, { name: "My restaurant", ownerUserId: userId });
        return currentMembership(tx, userId);
      }
    }
    return null;
  });
}

export async function currentMembership(tx: Executor, userId: string): Promise<MembershipInfo | null> {
  const [row] = await tx
    .select({ workspaceId: membership.workspaceId, workspaceName: workspace.name, role: membership.role })
    .from(membership)
    .innerJoin(workspace, eq(workspace.id, membership.workspaceId))
    .where(eq(membership.userId, userId))
    .orderBy(asc(membership.createdAt))
    .limit(1);
  return row ?? null;
}
