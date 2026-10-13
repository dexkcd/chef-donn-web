import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { z } from "zod";
import type { Action } from "@/domain/permissions";
import { auth } from "./auth";
import { runAction, type ActionResult, type Principal, type ServiceCtx } from "./context";
import { resolveMembership } from "./membership";

export type ViewerState =
  | { status: "anonymous" }
  | { status: "no_access"; email: string }
  | { status: "member"; principal: Principal & { actor: Extract<Principal["actor"], { type: "user" }> }; workspaceName: string };

/** The signed-in person and their workspace role. Cached per request. */
export const getViewer = cache(async (): Promise<ViewerState> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { status: "anonymous" };
  const m = await resolveMembership(session.user.id, session.user.email);
  if (!m) return { status: "no_access", email: session.user.email };
  return {
    status: "member",
    workspaceName: m.workspaceName,
    principal: {
      workspaceId: m.workspaceId,
      actor: { type: "user", userId: session.user.id, role: m.role, email: session.user.email, name: session.user.name },
    },
  };
});

/** For pages: send strangers to /login and uninvited people to /no-access. */
export async function requireMember() {
  const v = await getViewer();
  if (v.status === "anonymous") redirect("/login");
  if (v.status === "no_access") redirect("/no-access");
  return v;
}

/** For Server Actions: the same pipeline as everywhere else, as the signed-in person. */
export async function act<S extends z.ZodType, T>(
  action: Action,
  schema: S,
  raw: unknown,
  fn: (ctx: ServiceCtx, input: z.output<S>) => Promise<T>,
): Promise<ActionResult<T>> {
  const v = await getViewer();
  if (v.status !== "member") return { ok: false, reason: "You've been signed out. Sign in again to save." };
  return runAction(v.principal, action, schema, raw, fn);
}
