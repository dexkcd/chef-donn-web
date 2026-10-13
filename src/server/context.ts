/**
 * Every write goes through `runAction`: permission check → input validation → one
 * transaction → audit row in the same transaction. Rejections come back with a reason the
 * person can act on; nothing fails silently (same rule as Ack.reason on the Android hub).
 */
import type { z } from "zod";
import { db, type Tx } from "@/db/client";
import { auditEvent } from "@/db/schema";
import type { ApiKeyScope } from "@/db/schema/prices";
import { manilaToday, type LocalDate } from "@/domain/dates";
import { can, denialReason, type Action, type Role } from "@/domain/permissions";

export type Actor =
  | { type: "user"; userId: string; role: Role; email: string; name: string }
  | { type: "api_key"; keyId: string; scopes: readonly ApiKeyScope[] }
  | { type: "system" };

export interface Principal {
  workspaceId: string;
  actor: Actor;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; reason: string; fieldErrors?: Record<string, string>; status?: number };

/** A business-rule refusal. Shown to the person as-is. */
export class Rejection extends Error {
  constructor(
    message: string,
    readonly fieldErrors?: Record<string, string>,
    readonly status = 409,
  ) {
    super(message);
  }
}

export interface ServiceCtx {
  tx: Tx;
  workspaceId: string;
  actor: Actor;
  today: LocalDate;
  now: Date;
  audit(event: { action: string; subjectType?: string; subjectId?: string; before?: unknown; after?: unknown }): Promise<void>;
}

const API_KEY_ACTIONS: Record<ApiKeyScope, readonly Action[]> = {
  "prices:search": ["prices.search"],
  "prices:read": [],
};

export function actorCan(actor: Actor, action: Action): boolean {
  switch (actor.type) {
    case "user":
      return can(actor.role, action);
    case "api_key":
      return actor.scopes.some((s) => API_KEY_ACTIONS[s].includes(action));
    case "system":
      return true;
  }
}

function actorDenial(actor: Actor, action: Action): string {
  if (actor.type === "user") return denialReason(actor.role, action);
  return "This API key isn't allowed to do that.";
}

export function actorId(actor: Actor): string | null {
  return actor.type === "user" ? actor.userId : actor.type === "api_key" ? actor.keyId : null;
}

export function userIdOf(actor: Actor): string | null {
  return actor.type === "user" ? actor.userId : null;
}

export function makeCtx(tx: Tx, principal: Principal, now = new Date()): ServiceCtx {
  return {
    tx,
    workspaceId: principal.workspaceId,
    actor: principal.actor,
    now,
    today: manilaToday(now),
    async audit(e) {
      await tx.insert(auditEvent).values({
        workspaceId: principal.workspaceId,
        actorType: principal.actor.type,
        actorId: actorId(principal.actor),
        action: e.action,
        subjectType: e.subjectType ?? null,
        subjectId: e.subjectId ?? null,
        before: e.before ?? null,
        after: e.after ?? null,
      });
    },
  };
}

function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export async function runAction<S extends z.ZodType, T>(
  principal: Principal,
  action: Action,
  schema: S,
  raw: unknown,
  fn: (ctx: ServiceCtx, input: z.output<S>) => Promise<T>,
): Promise<ActionResult<T>> {
  if (!actorCan(principal.actor, action)) return { ok: false, reason: actorDenial(principal.actor, action), status: 403 };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors = zodFieldErrors(parsed.error);
    return { ok: false, reason: Object.values(fieldErrors)[0] ?? "Check the form.", fieldErrors, status: 422 };
  }
  try {
    const data = await db.transaction((tx) => fn(makeCtx(tx, principal), parsed.data));
    return { ok: true, data };
  } catch (e) {
    if (e instanceof Rejection) return { ok: false, reason: e.message, fieldErrors: e.fieldErrors, status: e.status };
    throw e;
  }
}

/** Read-only work in a transaction (consistent snapshot), with the same permission check. */
export async function runRead<T>(principal: Principal, action: Action, fn: (ctx: ServiceCtx) => Promise<T>): Promise<T> {
  if (!actorCan(principal.actor, action)) throw new Rejection(actorDenial(principal.actor, action), undefined, 403);
  return db.transaction((tx) => fn(makeCtx(tx, principal)), { accessMode: "read only" });
}
