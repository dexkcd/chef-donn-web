/** Budget writes. Every function runs inside runAction (permission-checked, one transaction, audited). */
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { budgetCategory, clientMutation, fundingSource, fundingTranche, moneyLine, payment, restaurantProfile } from "@/db/schema";
import { contingencyTarget, PAYMENT_METHODS } from "@/domain/budget";
import { isLocalDate } from "@/domain/dates";
import { STARTING_POINTS } from "@/domain/roadmap";
import { Rejection, userIdOf, type ServiceCtx } from "../context";
import { loadBudgetInputs } from "./budget-data";

// ── input schemas (shared by forms, API and tests) ─────────────────────────────────────────
const cents = z
  .number({ error: "Enter an amount in pesos, like 12,500." })
  .int()
  .min(0, "Amounts can't be negative.")
  .max(9_000_000_000_000, "That amount is too large.");
const positiveCents = cents.min(1, "Enter an amount above zero.");
const date = z.string().refine(isLocalDate, "Pick a date.");
const optionalDate = z.union([date, z.null()]).optional();
const text = (max = 200) => z.string().trim().min(1, "This can't be empty.").max(max);
const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === "" ? null : s))
    .nullable()
    .optional();

export const createLineInput = z.object({
  id: z.uuid().optional(),
  categoryId: z.uuid("Pick a category."),
  description: text(),
  plannedCents: cents,
  committedCents: cents.default(0),
  dueDate: optionalDate,
  payeeName: optionalText(),
});

export const updateLineInput = z.object({
  lineId: z.uuid(),
  categoryId: z.uuid().optional(),
  description: text().optional(),
  plannedCents: cents.optional(),
  committedCents: cents.optional(),
  dueDate: optionalDate,
  payeeName: optionalText(),
});

export const lineIdInput = z.object({ lineId: z.uuid(), reason: optionalText(300) });

export const logPaymentInput = z.object({
  clientId: z.uuid().optional(),
  moneyLineId: z.uuid("Pick the budget line this payment is for."),
  amountCents: positiveCents,
  paidOn: date,
  method: z.enum(PAYMENT_METHODS),
  payeeName: optionalText(),
  referenceNo: optionalText(80),
  notes: optionalText(500),
  receiptDocumentId: z.uuid().nullable().optional(),
  grossCents: cents.nullable().optional(),
  withholdingCents: cents.nullable().optional(),
});

export const voidPaymentInput = z.object({ paymentId: z.uuid(), reason: text(300) });

export const fundingSourceInput = z.object({
  id: z.uuid().optional(),
  type: z.enum(["owner_equity", "partner_equity", "loan", "investor", "other"]),
  name: text(),
  committedCents: cents,
  expectedOn: optionalDate,
  notes: optionalText(500),
});

export const trancheInput = z.object({
  fundingSourceId: z.uuid(),
  amountCents: positiveCents,
  receivedOn: date,
  notes: optionalText(500),
});

export const profileInput = z.object({
  name: text(120),
  concept: optionalText(500),
  targetOpeningDate: optionalDate,
  totalBudgetCents: cents.nullable().optional(),
  contingencyBp: z.number().int().min(0).max(5000, "Keep contingency at or under 50%."),
  seats: z.number().int().min(0).max(2000).nullable().optional(),
  startingPoint: z.enum(STARTING_POINTS).optional(),
});

// ── helpers ───────────────────────────────────────────────────────────────────────────────
export async function getLine(ctx: ServiceCtx, lineId: string) {
  const [line] = await ctx.tx
    .select()
    .from(moneyLine)
    .where(and(eq(moneyLine.id, lineId), eq(moneyLine.workspaceId, ctx.workspaceId)))
    .for("update");
  if (!line || line.voidedAt) throw new Rejection("That budget line no longer exists.", undefined, 404);
  return line;
}

async function getCategory(ctx: ServiceCtx, categoryId: string) {
  const [cat] = await ctx.tx
    .select()
    .from(budgetCategory)
    .where(and(eq(budgetCategory.id, categoryId), eq(budgetCategory.workspaceId, ctx.workspaceId)));
  if (!cat || cat.archivedAt) throw new Rejection("That category doesn't exist any more.", { categoryId: "Pick a category." });
  return cat;
}

/**
 * Keep the contingency line at contingency% of everything planned in normal categories.
 * Called after every change to planned amounts or to the percentage.
 */
export async function syncContingencyLine(ctx: ServiceCtx): Promise<void> {
  const [profile] = await ctx.tx.select().from(restaurantProfile).where(eq(restaurantProfile.workspaceId, ctx.workspaceId));
  if (!profile) return;
  const inputs = await loadBudgetInputs(ctx.tx, ctx.workspaceId);
  const contingencyCat = inputs.cats.find((c) => c.kind === "contingency" && c.archivedAt === null);
  if (!contingencyCat) return;
  const target = contingencyTarget(inputs.categories, inputs.lineInputs.filter((l) => l.sourceType !== "contingency_rule"), profile.contingencyBp);
  const existing = inputs.lines.find((l) => l.sourceType === "contingency_rule");
  const description = `Contingency (${profile.contingencyBp / 100}% of planned)`;
  if (existing) {
    if (existing.plannedCents !== target || existing.description !== description || existing.categoryId !== contingencyCat.id) {
      await ctx.tx.update(moneyLine).set({ plannedCents: target, description, categoryId: contingencyCat.id }).where(eq(moneyLine.id, existing.id));
    }
  } else {
    await ctx.tx.insert(moneyLine).values({
      workspaceId: ctx.workspaceId,
      categoryId: contingencyCat.id,
      description,
      plannedCents: target,
      sourceType: "contingency_rule",
      sourceId: ctx.workspaceId,
      locked: true,
    });
  }
}

/** Offline replays: the same clientId returns the first result instead of writing twice. */
export async function claimClientId(ctx: ServiceCtx, clientId: string | undefined, kind: string): Promise<string | null> {
  if (!clientId) return null;
  const inserted = await ctx.tx
    .insert(clientMutation)
    .values({ workspaceId: ctx.workspaceId, clientId, kind })
    .onConflictDoNothing()
    .returning({ clientId: clientMutation.clientId });
  if (inserted.length > 0) return null;
  const [prior] = await ctx.tx
    .select()
    .from(clientMutation)
    .where(and(eq(clientMutation.workspaceId, ctx.workspaceId), eq(clientMutation.clientId, clientId)));
  if (prior && prior.kind !== kind) throw new Rejection("That request id was already used for something else.");
  return prior?.resultRef ?? null;
}

export async function recordClientResult(ctx: ServiceCtx, clientId: string | undefined, resultRef: string) {
  if (!clientId) return;
  await ctx.tx
    .update(clientMutation)
    .set({ resultRef })
    .where(and(eq(clientMutation.workspaceId, ctx.workspaceId), eq(clientMutation.clientId, clientId)));
}

// ── lines ─────────────────────────────────────────────────────────────────────────────────
export async function createLine(ctx: ServiceCtx, input: z.output<typeof createLineInput>) {
  const cat = await getCategory(ctx, input.categoryId);
  if (cat.kind === "contingency") throw new Rejection("Contingency is set as a percentage in the profile, not as lines.");
  const [line] = await ctx.tx
    .insert(moneyLine)
    .values({
      ...(input.id ? { id: input.id } : {}),
      workspaceId: ctx.workspaceId,
      categoryId: cat.id,
      description: input.description,
      plannedCents: input.plannedCents,
      committedCents: input.committedCents,
      dueDate: input.dueDate ?? null,
      payeeName: input.payeeName ?? null,
      sourceType: "manual",
      createdBy: userIdOf(ctx.actor),
    })
    .returning();
  await syncContingencyLine(ctx);
  await ctx.audit({ action: "line.create", subjectType: "money_line", subjectId: line!.id, after: line });
  return line!;
}

export async function updateLine(ctx: ServiceCtx, input: z.output<typeof updateLineInput>) {
  const line = await getLine(ctx, input.lineId);
  const changesFollowSource =
    (input.plannedCents !== undefined && input.plannedCents !== line.plannedCents) ||
    (input.description !== undefined && input.description !== line.description) ||
    (input.categoryId !== undefined && input.categoryId !== line.categoryId);
  if (line.locked && changesFollowSource) {
    throw new Rejection(
      line.sourceType === "task"
        ? "This line follows its roadmap task — change the estimate on the task."
        : "This line is calculated automatically and can't be edited here.",
    );
  }
  if (input.categoryId) {
    const cat = await getCategory(ctx, input.categoryId);
    if (cat.kind === "contingency") throw new Rejection("Lines can't be moved into Contingency.");
  }
  const patch = {
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.plannedCents !== undefined ? { plannedCents: input.plannedCents } : {}),
    ...(input.committedCents !== undefined ? { committedCents: input.committedCents } : {}),
    ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
    ...(input.payeeName !== undefined ? { payeeName: input.payeeName } : {}),
  };
  const [after] = await ctx.tx.update(moneyLine).set(patch).where(eq(moneyLine.id, line.id)).returning();
  await syncContingencyLine(ctx);
  await ctx.audit({ action: "line.edit", subjectType: "money_line", subjectId: line.id, before: line, after });
  return after!;
}

/** "Nothing more to pay on this" — releases any unspent plan back to contingency. */
export async function setLineClosed(ctx: ServiceCtx, input: { lineId: string; closed: boolean }) {
  const line = await getLine(ctx, input.lineId);
  if (line.sourceType === "contingency_rule") throw new Rejection("The contingency line can't be closed.");
  const [after] = await ctx.tx
    .update(moneyLine)
    .set({ closedAt: input.closed ? ctx.now : null })
    .where(eq(moneyLine.id, line.id))
    .returning();
  await ctx.audit({ action: input.closed ? "line.close" : "line.reopen", subjectType: "money_line", subjectId: line.id });
  return after!;
}

export async function voidLine(ctx: ServiceCtx, input: z.output<typeof lineIdInput>) {
  const line = await getLine(ctx, input.lineId);
  if (line.locked) throw new Rejection("This line belongs to a roadmap task or rule — skip the task instead.");
  const [{ n }] = (await ctx.tx
    .select({ n: sql<number>`count(*)::int` })
    .from(payment)
    .where(and(eq(payment.moneyLineId, line.id), isNull(payment.voidedAt)))) as [{ n: number }];
  if (n > 0) throw new Rejection("This line has payments. Void the payments first, or close the line instead.");
  await ctx.tx.update(moneyLine).set({ voidedAt: ctx.now, voidReason: input.reason ?? null }).where(eq(moneyLine.id, line.id));
  await syncContingencyLine(ctx);
  await ctx.audit({ action: "line.void", subjectType: "money_line", subjectId: line.id, before: line });
}

// ── payments ──────────────────────────────────────────────────────────────────────────────
export async function logPayment(ctx: ServiceCtx, input: z.output<typeof logPaymentInput>) {
  const prior = await claimClientId(ctx, input.clientId, "payment.log");
  if (prior) {
    const [p] = await ctx.tx.select().from(payment).where(eq(payment.id, prior));
    if (p) return p;
  }
  const line = await getLine(ctx, input.moneyLineId);
  if (line.closedAt) throw new Rejection("That line is closed. Reopen it before adding payments.");
  const withholding = input.withholdingCents ?? null;
  const gross = input.grossCents ?? null;
  if (gross !== null && withholding !== null && gross - withholding !== input.amountCents) {
    throw new Rejection("Gross minus withholding should equal the amount paid.", { amountCents: "Should be gross − withholding." });
  }
  const [p] = await ctx.tx
    .insert(payment)
    .values({
      workspaceId: ctx.workspaceId,
      moneyLineId: line.id,
      amountCents: input.amountCents,
      paidOn: input.paidOn,
      method: input.method,
      payeeName: input.payeeName ?? line.payeeName ?? null,
      referenceNo: input.referenceNo ?? null,
      notes: input.notes ?? null,
      receiptDocumentId: input.receiptDocumentId ?? null,
      grossCents: gross,
      withholdingCents: withholding,
      netCents: gross !== null ? input.amountCents : null,
      createdBy: userIdOf(ctx.actor),
    })
    .returning();
  await recordClientResult(ctx, input.clientId, p!.id);
  await ctx.audit({ action: "payment.log", subjectType: "payment", subjectId: p!.id, after: p });
  return p!;
}

export async function voidPayment(ctx: ServiceCtx, input: z.output<typeof voidPaymentInput>) {
  const [p] = await ctx.tx
    .select()
    .from(payment)
    .where(and(eq(payment.id, input.paymentId), eq(payment.workspaceId, ctx.workspaceId)))
    .for("update");
  if (!p || p.voidedAt) throw new Rejection("That payment doesn't exist or is already voided.", undefined, 404);
  await ctx.tx.update(payment).set({ voidedAt: ctx.now, voidReason: input.reason }).where(eq(payment.id, p.id));
  await ctx.audit({ action: "payment.void", subjectType: "payment", subjectId: p.id, before: p });
}

// ── funding ───────────────────────────────────────────────────────────────────────────────
export async function saveFundingSource(ctx: ServiceCtx, input: z.output<typeof fundingSourceInput>) {
  const values = {
    type: input.type,
    name: input.name,
    committedCents: input.committedCents,
    expectedOn: input.expectedOn ?? null,
    notes: input.notes ?? null,
  };
  if (input.id) {
    const [after] = await ctx.tx
      .update(fundingSource)
      .set(values)
      .where(and(eq(fundingSource.id, input.id), eq(fundingSource.workspaceId, ctx.workspaceId)))
      .returning();
    if (!after) throw new Rejection("That funding source doesn't exist.", undefined, 404);
    await ctx.audit({ action: "funding.edit", subjectType: "funding_source", subjectId: after.id, after });
    return after;
  }
  const [created] = await ctx.tx.insert(fundingSource).values({ ...values, workspaceId: ctx.workspaceId }).returning();
  await ctx.audit({ action: "funding.create", subjectType: "funding_source", subjectId: created!.id, after: created });
  return created!;
}

export async function addTranche(ctx: ServiceCtx, input: z.output<typeof trancheInput>) {
  const [src] = await ctx.tx
    .select()
    .from(fundingSource)
    .where(and(eq(fundingSource.id, input.fundingSourceId), eq(fundingSource.workspaceId, ctx.workspaceId)));
  if (!src) throw new Rejection("That funding source doesn't exist.", undefined, 404);
  const [t] = await ctx.tx
    .insert(fundingTranche)
    .values({ ...input, notes: input.notes ?? null, workspaceId: ctx.workspaceId, createdBy: userIdOf(ctx.actor) })
    .returning();
  await ctx.audit({ action: "funding.receive", subjectType: "funding_source", subjectId: src.id, after: t });
  return t!;
}

// ── profile ───────────────────────────────────────────────────────────────────────────────
export async function updateProfile(ctx: ServiceCtx, input: z.output<typeof profileInput>) {
  const [before] = await ctx.tx.select().from(restaurantProfile).where(eq(restaurantProfile.workspaceId, ctx.workspaceId));
  const [after] = await ctx.tx
    .update(restaurantProfile)
    .set({
      name: input.name,
      concept: input.concept ?? null,
      targetOpeningDate: input.targetOpeningDate ?? null,
      totalBudgetCents: input.totalBudgetCents ?? null,
      contingencyBp: input.contingencyBp,
      seats: input.seats ?? null,
      ...(input.startingPoint ? { startingPoint: input.startingPoint } : {}),
    })
    .where(eq(restaurantProfile.workspaceId, ctx.workspaceId))
    .returning();
  await syncContingencyLine(ctx);
  await ctx.audit({ action: "profile.edit", subjectType: "restaurant_profile", subjectId: ctx.workspaceId, before, after });
  return after!;
}
