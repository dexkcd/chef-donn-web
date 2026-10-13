import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db/client";
import { budgetCategory, invitation, membership, moneyLine, user } from "@/db/schema";
import { ROLES } from "@/domain/permissions";
import { Rejection, userIdOf, type ServiceCtx } from "../context";

export const inviteInput = z.object({
  email: z.email("Enter their email address.").transform((e) => e.trim().toLowerCase()),
  role: z.enum(ROLES),
});

export async function inviteMember(ctx: ServiceCtx, input: z.output<typeof inviteInput>) {
  const existing = await ctx.tx
    .select({ id: membership.id })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(and(eq(membership.workspaceId, ctx.workspaceId), sql`lower(${user.email}) = ${input.email}`));
  if (existing.length > 0) throw new Rejection(`${input.email} is already part of this restaurant.`, { email: "Already a member." });
  await ctx.tx
    .update(invitation)
    .set({ revokedAt: ctx.now })
    .where(and(eq(invitation.workspaceId, ctx.workspaceId), sql`lower(${invitation.email}) = ${input.email}`, isNull(invitation.acceptedAt), isNull(invitation.revokedAt)));
  const [inv] = await ctx.tx
    .insert(invitation)
    .values({ workspaceId: ctx.workspaceId, email: input.email, role: input.role, invitedBy: userIdOf(ctx.actor), expiresAt: new Date(ctx.now.getTime() + 14 * 86_400_000) })
    .returning();
  await ctx.audit({ action: "members.invite", subjectType: "invitation", subjectId: inv!.id, after: { email: input.email, role: input.role } });
  return inv!;
}

export async function revokeInvitation(ctx: ServiceCtx, input: { invitationId: string }) {
  const [inv] = await ctx.tx
    .update(invitation)
    .set({ revokedAt: ctx.now })
    .where(and(eq(invitation.id, input.invitationId), eq(invitation.workspaceId, ctx.workspaceId), isNull(invitation.acceptedAt)))
    .returning();
  if (!inv) throw new Rejection("That invitation can't be revoked.", undefined, 404);
  await ctx.audit({ action: "members.revoke_invite", subjectType: "invitation", subjectId: inv.id });
}

export async function changeRole(ctx: ServiceCtx, input: { membershipId: string; role: (typeof ROLES)[number] }) {
  const [m] = await ctx.tx
    .select()
    .from(membership)
    .where(and(eq(membership.id, input.membershipId), eq(membership.workspaceId, ctx.workspaceId)));
  if (!m) throw new Rejection("That person isn't in this restaurant.", undefined, 404);
  if (m.role === "owner" && input.role !== "owner") {
    const owners = await ctx.tx.select().from(membership).where(and(eq(membership.workspaceId, ctx.workspaceId), eq(membership.role, "owner")));
    if (owners.length <= 1) throw new Rejection("There must always be at least one owner.");
  }
  await ctx.tx.update(membership).set({ role: input.role }).where(eq(membership.id, m.id));
  await ctx.audit({ action: "members.change_role", subjectType: "membership", subjectId: m.id, before: { role: m.role }, after: { role: input.role } });
}

export async function listMembers(exec: Executor, workspaceId: string) {
  const members = await exec
    .select({ id: membership.id, role: membership.role, name: user.name, email: user.email, userId: user.id })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(eq(membership.workspaceId, workspaceId))
    .orderBy(asc(membership.createdAt));
  const invites = await exec
    .select()
    .from(invitation)
    .where(and(eq(invitation.workspaceId, workspaceId), isNull(invitation.acceptedAt), isNull(invitation.revokedAt)))
    .orderBy(asc(invitation.createdAt));
  return { members, invites };
}

// ── categories ────────────────────────────────────────────────────────────────────────────
export const categoryInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Name the category.").max(80),
  hint: z.string().trim().max(200).nullable().optional(),
});

export async function saveCategory(ctx: ServiceCtx, input: z.output<typeof categoryInput>) {
  if (input.id) {
    const [c] = await ctx.tx
      .update(budgetCategory)
      .set({ name: input.name, hint: input.hint ?? null })
      .where(and(eq(budgetCategory.id, input.id), eq(budgetCategory.workspaceId, ctx.workspaceId)))
      .returning();
    if (!c) throw new Rejection("That category doesn't exist.", undefined, 404);
    await ctx.audit({ action: "category.edit", subjectType: "budget_category", subjectId: c.id, after: c });
    return c;
  }
  const [{ maxSort }] = (await ctx.tx
    .select({ maxSort: sql<number>`coalesce(max(${budgetCategory.sort}) filter (where ${budgetCategory.kind} = 'normal'), 0)::int` })
    .from(budgetCategory)
    .where(eq(budgetCategory.workspaceId, ctx.workspaceId))) as [{ maxSort: number }];
  const key = `custom_${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30)}_${Date.now().toString(36)}`;
  const [c] = await ctx.tx
    .insert(budgetCategory)
    .values({ workspaceId: ctx.workspaceId, key, name: input.name, hint: input.hint ?? null, kind: "normal", sort: maxSort + 5 })
    .returning();
  await ctx.audit({ action: "category.create", subjectType: "budget_category", subjectId: c!.id, after: c });
  return c!;
}

export async function setCategoryArchived(ctx: ServiceCtx, input: { categoryId: string; archived: boolean }) {
  const [c] = await ctx.tx
    .select()
    .from(budgetCategory)
    .where(and(eq(budgetCategory.id, input.categoryId), eq(budgetCategory.workspaceId, ctx.workspaceId)));
  if (!c) throw new Rejection("That category doesn't exist.", undefined, 404);
  if (c.kind !== "normal") throw new Rejection("Contingency and the working-capital reserve can't be archived.");
  if (input.archived) {
    const [{ n }] = (await ctx.tx
      .select({ n: sql<number>`count(*)::int` })
      .from(moneyLine)
      .where(and(eq(moneyLine.categoryId, c.id), isNull(moneyLine.voidedAt)))) as [{ n: number }];
    if (n > 0) throw new Rejection(`Move or remove its ${n} line${n === 1 ? "" : "s"} first.`);
  }
  await ctx.tx.update(budgetCategory).set({ archivedAt: input.archived ? ctx.now : null }).where(eq(budgetCategory.id, c.id));
  await ctx.audit({ action: input.archived ? "category.archive" : "category.restore", subjectType: "budget_category", subjectId: c.id });
}
