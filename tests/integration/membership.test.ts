import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { budgetCategory, invitation, membership } from "@/db/schema";
import { mayReceiveSignInLink, resolveMembership } from "@/server/membership";
import { makeUser, makeWorkspace } from "./helpers";

describe("membership", () => {
  it("creates a workspace with the 13 default categories", async () => {
    const { ws } = await makeWorkspace();
    const cats = await db.select().from(budgetCategory).where(eq(budgetCategory.workspaceId, ws.id));
    expect(cats).toHaveLength(13);
    expect(cats.filter((c) => c.kind === "contingency")).toHaveLength(1);
  });

  it("accepts an invitation on first login, with the invited role", async () => {
    const { ws, owner } = await makeWorkspace();
    await db.insert(invitation).values({ workspaceId: ws.id, email: "Helper@Example.ph", role: "helper", invitedBy: owner.id, expiresAt: new Date(Date.now() + 86_400_000) });
    expect(await mayReceiveSignInLink("helper@example.ph")).toBe(true);
    const u = await makeUser("helper@example.ph");
    const m = await resolveMembership(u.id, u.email);
    expect(m).toMatchObject({ workspaceId: ws.id, role: "helper" });
    const [inv] = await db.select().from(invitation).where(eq(invitation.workspaceId, ws.id));
    expect(inv?.acceptedAt).not.toBeNull();
  });

  it("refuses strangers and expired invitations", async () => {
    const { ws, owner } = await makeWorkspace();
    await db.insert(invitation).values({ workspaceId: ws.id, email: "late@example.ph", role: "partner", invitedBy: owner.id, expiresAt: new Date(Date.now() - 1000) });
    expect(await mayReceiveSignInLink("late@example.ph")).toBe(false);
    expect(await mayReceiveSignInLink("stranger@example.ph")).toBe(false);
    const u = await makeUser("stranger@example.ph");
    expect(await resolveMembership(u.id, u.email)).toBeNull();
    expect(await db.select().from(membership).where(eq(membership.userId, u.id))).toHaveLength(0);
  });

});
