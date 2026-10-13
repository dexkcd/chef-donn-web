import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { workspace } from "@/db/schema";
import { env } from "@/server/env";
import { resolveMembership } from "@/server/membership";
import { makeUser } from "./helpers";

// Runs in its own fresh database: no workspace exists yet.
describe("first-owner bootstrap", () => {
  it("bootstraps exactly one workspace for BOOTSTRAP_OWNER_EMAIL", async () => {
    env.bootstrapOwnerEmail = "first@example.ph";
    const u = await makeUser("first@example.ph");
    const [a, b] = await Promise.all([resolveMembership(u.id, u.email), resolveMembership(u.id, u.email)]);
    expect(a?.role).toBe("owner");
    expect(b?.workspaceId).toBe(a?.workspaceId);
    expect(await db.select().from(workspace)).toHaveLength(1);
    // Once a workspace exists, the bootstrap email gets no special treatment.
    const other = await makeUser("someone@example.ph");
    expect(await resolveMembership(other.id, other.email)).toBeNull();
    env.bootstrapOwnerEmail = null;
  });
});
