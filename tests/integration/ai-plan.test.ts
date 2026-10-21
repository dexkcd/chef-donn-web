import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { auditEvent, moneyLine, planDraft, task } from "@/db/schema";
import { EMPTY_ANSWERS, type PlanAnswers } from "@/domain/plan";
import { runAction, type Principal } from "@/server/context";
import { env } from "@/server/env";
import { runPlanDraft } from "@/server/jobs/plan-draft";
import { applyPlanDraft, applyPlanInput, getPlanDraft, liveItems, requestPlanDraft, requestPlanInput } from "@/server/services/ai-plan";
import { budgetOverview } from "@/server/services/budget-data";
import { onboard, onboardInput, setTaskStatus, taskStatusInput } from "@/server/services/roadmap";
import { expectOk, makeWorkspace } from "./helpers";

const answers: PlanAnswers = { ...EMPTY_ANSWERS, seats: 40, space: "bare_shell", rentMonthlyCents: 25_000_00, depositMonths: 2, advanceMonths: 1, alreadyHave: ["generator"], notes: "Beach-side seafood grill" };

async function setup() {
  const w = await makeWorkspace();
  expectOk(await runAction(w.ownerPrincipal, "profile.edit", onboardInput, { name: "K", startingPoint: "building", totalBudgetCents: 4_000_000_00, contingencyBp: 1000 }, onboard));
  return w;
}

async function draftReady(p: Principal, a: PlanAnswers = answers) {
  const d = expectOk(await runAction(p, "plan.draft", requestPlanInput, { answers: a }, requestPlanDraft));
  expect(await runPlanDraft(d.id)).toBe("ready");
  return (await getPlanDraft(db, p.workspaceId, d.id))!;
}

const taskByTitle = async (workspaceId: string, re: RegExp) => (await db.select().from(task).where(eq(task.workspaceId, workspaceId))).find((t) => re.test(t.title))!;

describe("AI-drafted plans", () => {
  it("drafts from the answers, and nothing changes until a person applies", async () => {
    const { ws, ownerPrincipal } = await setup();
    const before = await budgetOverview(db, ws.id, "2026-10-21");
    const d = await draftReady(ownerPrincipal);
    expect(d.status).toBe("ready");
    const ids = d.proposal!.items.map((i) => i.id);
    expect(d.proposal!.items.find((i) => i.description === "Buy kitchen and refrigeration equipment")).toMatchObject({ kind: "task", proposedCents: 650_000_00 });
    expect(d.proposal!.items.find((i) => /^Backup generator \(/.test(i.description))).toMatchObject({ proposedCents: 0 });
    expect(d.proposal!.items.filter((i) => i.kind === "new").map((i) => i.description)).toEqual(["Water tank & pump", "Uniforms & aprons"]);
    expect(ids.length).toBeGreaterThan(3);
    const still = await budgetOverview(db, ws.id, "2026-10-21");
    expect(still.rollup.totals.planned).toBe(before.rollup.totals.planned);
  });

  it("applying moves task lines (basis ai_plan), adds ai_plan lines, re-syncs contingency and is audited", async () => {
    const { ws, ownerPrincipal } = await setup();
    const d = await draftReady(ownerPrincipal);
    const all = d.proposal!.items.map((i) => i.id);
    expect(expectOk(await runAction(ownerPrincipal, "plan.apply", applyPlanInput, { draftId: d.id, itemIds: all }, applyPlanDraft))).toEqual({ applied: all.length });

    const kitchen = await taskByTitle(ws.id, /kitchen and refrigeration/);
    expect(kitchen).toMatchObject({ estimateCents: 650_000_00, estimateBasis: "ai_plan" });
    const [kitchenLine] = await db.select().from(moneyLine).where(eq(moneyLine.sourceId, kitchen.id));
    expect(kitchenLine!.plannedCents).toBe(650_000_00);
    const gen = await taskByTitle(ws.id, /^Backup generator \(/);
    expect(gen.estimateCents).toBe(0);
    const aiLines = await db.select().from(moneyLine).where(and(eq(moneyLine.workspaceId, ws.id), eq(moneyLine.sourceType, "ai_plan")));
    expect(aiLines.map((l) => [l.description, l.plannedCents]).sort()).toEqual([
      ["Uniforms & aprons", 12_000_00],
      ["Water tank & pump", 35_000_00],
    ]);

    const o = await budgetOverview(db, ws.id, "2026-10-21");
    const normal = o.rollup.categories.filter((c) => c.category.kind === "normal").reduce((a, c) => a + c.planned, 0);
    expect(o.rollup.contingency.planned).toBe(Math.round(normal / 10));
    const [after] = await db.select().from(planDraft).where(eq(planDraft.id, d.id));
    expect(after).toMatchObject({ status: "applied", appliedItems: all });
    expect(await db.select().from(auditEvent).where(and(eq(auditEvent.subjectId, d.id), eq(auditEvent.action, "plan.apply")))).toHaveLength(1);

    // Applying twice is refused.
    expect(await runAction(ownerPrincipal, "plan.apply", applyPlanInput, { draftId: d.id, itemIds: all }, applyPlanDraft)).toMatchObject({ ok: false, reason: expect.stringContaining("already applied") });
  });

  it("applies only the ticked changes", async () => {
    const { ws, ownerPrincipal } = await setup();
    const d = await draftReady(ownerPrincipal);
    const water = d.proposal!.items.find((i) => i.description === "Water tank & pump")!;
    expectOk(await runAction(ownerPrincipal, "plan.apply", applyPlanInput, { draftId: d.id, itemIds: [water.id] }, applyPlanDraft));
    expect((await taskByTitle(ws.id, /kitchen and refrigeration/)).estimateBasis).toBe("template_mid");
    expect(await db.select().from(moneyLine).where(and(eq(moneyLine.workspaceId, ws.id), eq(moneyLine.sourceType, "ai_plan")))).toHaveLength(1);
  });

  it("a re-run sees what was applied: it proposes changes to AI lines instead of duplicating them", async () => {
    const { ws, ownerPrincipal } = await setup();
    const first = await draftReady(ownerPrincipal);
    expectOk(await runAction(ownerPrincipal, "plan.apply", applyPlanInput, { draftId: first.id, itemIds: first.proposal!.items.map((i) => i.id) }, applyPlanDraft));

    const second = await draftReady(ownerPrincipal, { ...answers, alreadyHave: ["generator", "water_tank"] });
    const live = await liveItems(db, ws.id, second.proposal!.items);
    // Kitchen is already 650k → not proposed again; uniforms line gets a change, not a duplicate.
    expect(live.find((i) => i.description === "Buy kitchen and refrigeration equipment")).toBeUndefined();
    expect(live.filter((i) => i.kind === "new").map((i) => i.description)).toEqual([]);
    expect(live.find((i) => i.kind === "line" && i.description === "Uniforms & aprons")).toMatchObject({ currentCents: 12_000_00, proposedCents: 15_000_00 });
  });

  it("is all or nothing when a ticked task was skipped since the draft", async () => {
    const { ws, ownerPrincipal } = await setup();
    const d = await draftReady(ownerPrincipal);
    const kitchen = await taskByTitle(ws.id, /kitchen and refrigeration/);
    expectOk(await runAction(ownerPrincipal, "task.set_status", taskStatusInput, { taskId: kitchen.id, status: "skipped" }, setTaskStatus));
    const r = await runAction(ownerPrincipal, "plan.apply", applyPlanInput, { draftId: d.id, itemIds: d.proposal!.items.map((i) => i.id) }, applyPlanDraft);
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("skipped") });
    expect(await db.select().from(moneyLine).where(and(eq(moneyLine.workspaceId, ws.id), eq(moneyLine.sourceType, "ai_plan")))).toHaveLength(0);
    expect((await getPlanDraft(db, ws.id, d.id))!.status).toBe("ready");
  });

  it("only owners and partners can draft or apply, and drafts per day are limited", async () => {
    const { as, ownerPrincipal } = await setup();
    for (const role of ["helper", "bookkeeper"] as const) {
      expect(await runAction(await as(role), "plan.draft", requestPlanInput, { answers }, requestPlanDraft)).toMatchObject({ ok: false, status: 403 });
    }
    const limit = env.planDraftDailyLimit;
    env.planDraftDailyLimit = 1;
    try {
      expectOk(await runAction(ownerPrincipal, "plan.draft", requestPlanInput, { answers }, requestPlanDraft));
      expect(await runAction(ownerPrincipal, "plan.draft", requestPlanInput, { answers }, requestPlanDraft)).toMatchObject({ ok: false, status: 429 });
    } finally {
      env.planDraftDailyLimit = limit;
    }
  });

  it("a failing drafter retries, then fails with the reason", async () => {
    const { ownerPrincipal } = await setup();
    const d = expectOk(await runAction(ownerPrincipal, "plan.draft", requestPlanInput, { answers: { ...answers, notes: "please explode" } }, requestPlanDraft));
    expect(await runPlanDraft(d.id)).toBe("retry");
    expect(await runPlanDraft(d.id)).toBe("retry");
    expect(await runPlanDraft(d.id)).toBe("failed");
    expect((await getPlanDraft(db, ownerPrincipal.workspaceId, d.id))!).toMatchObject({ status: "failed", lastError: expect.stringContaining("fake planner failure") });
  });
});
