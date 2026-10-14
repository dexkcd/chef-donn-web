import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { budgetCategory, moneyLine, task } from "@/db/schema";
import { runAction } from "@/server/context";
import { createLine, createLineInput } from "@/server/services/budget";
import { budgetOverview } from "@/server/services/budget-data";
import { categoryPlansInput, setCategoryPlans } from "@/server/services/plans";
import { onboard, onboardInput, setTaskStatus, taskStatusInput } from "@/server/services/roadmap";
import { expectOk, makeWorkspace } from "./helpers";

async function setup() {
  const w = await makeWorkspace();
  expectOk(await runAction(w.ownerPrincipal, "profile.edit", onboardInput, { name: "K", startingPoint: "building", contingencyBp: 1000 }, onboard));
  const [equip] = await db.select().from(budgetCategory).where(and(eq(budgetCategory.workspaceId, w.ws.id), eq(budgetCategory.key, "equipment")));
  const [t] = await db.select().from(task).where(and(eq(task.workspaceId, w.ws.id), eq(task.templateKey, "ph.build.kitchen_equipment")));
  const [taskLine] = await db.select().from(moneyLine).where(eq(moneyLine.sourceId, t!.id));
  const manual = expectOk(await runAction(w.ownerPrincipal, "line.create", createLineInput, { categoryId: equip!.id, description: "Ice machine", plannedCents: 60_000_00 }, createLine));
  return { ...w, equip: equip!, task: t!, taskLine: taskLine!, manual };
}

const save = (p: Parameters<typeof runAction>[0], categoryId: string, plans: { lineId: string; plannedCents: number }[]) =>
  runAction(p, "line.edit", categoryPlansInput, { categoryId, plans }, setCategoryPlans);

describe("saving a category's planned amounts at once", () => {
  it("edits manual lines directly and roadmap lines through their task; contingency follows", async () => {
    const { ws, ownerPrincipal, equip, task: t, taskLine, manual } = await setup();
    expect(taskLine.categoryId).toBe(equip.id);
    const r = expectOk(
      await save(ownerPrincipal, equip.id, [
        { lineId: taskLine.id, plannedCents: 650_000_00 },
        { lineId: manual.id, plannedCents: 75_000_00 },
      ]),
    );
    expect(r.changed).toBe(2);

    const [tAfter] = await db.select().from(task).where(eq(task.id, t.id));
    expect(tAfter).toMatchObject({ estimateCents: 650_000_00, estimateBasis: "owner" });
    const [lineAfter] = await db.select().from(moneyLine).where(eq(moneyLine.id, taskLine.id));
    expect(lineAfter!.plannedCents).toBe(650_000_00);
    const [manualAfter] = await db.select().from(moneyLine).where(eq(moneyLine.id, manual.id));
    expect(manualAfter!.plannedCents).toBe(75_000_00);

    const o = await budgetOverview(db, ws.id, "2026-10-14");
    const normal = o.rollup.categories.filter((c) => c.category.kind === "normal").reduce((a, c) => a + c.planned, 0);
    expect(o.rollup.contingency.planned).toBe(Math.round(normal / 10));

    // Saving the same values again changes nothing.
    expect(expectOk(await save(ownerPrincipal, equip.id, [{ lineId: manual.id, plannedCents: 75_000_00 }])).changed).toBe(0);
  });

  it("is all or nothing, and says which line was refused", async () => {
    const { ownerPrincipal, equip, task: t, taskLine, manual } = await setup();
    expectOk(await runAction(ownerPrincipal, "task.set_status", taskStatusInput, { taskId: t.id, status: "skipped" }, setTaskStatus));
    const r = await save(ownerPrincipal, equip.id, [
      { lineId: manual.id, plannedCents: 1_00 },
      { lineId: taskLine.id, plannedCents: 500_000_00 },
    ]);
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining("skipped"), fieldErrors: { [`planned.${taskLine.id}`]: "Task skipped." } });
    const [manualAfter] = await db.select().from(moneyLine).where(eq(moneyLine.id, manual.id));
    expect(manualAfter!.plannedCents).toBe(60_000_00);
  });

  it("refuses a line from another category, the contingency category, and roles that can't edit the budget", async () => {
    const { ws, as, ownerPrincipal, equip, manual } = await setup();
    const [site] = await db.select().from(budgetCategory).where(and(eq(budgetCategory.workspaceId, ws.id), eq(budgetCategory.key, "site")));
    expect(await save(ownerPrincipal, site!.id, [{ lineId: manual.id, plannedCents: 1 }])).toMatchObject({ ok: false, reason: expect.stringContaining("reload") });
    const [cont] = await db.select().from(budgetCategory).where(and(eq(budgetCategory.workspaceId, ws.id), eq(budgetCategory.kind, "contingency")));
    expect(await save(ownerPrincipal, cont!.id, [])).toMatchObject({ ok: false, reason: expect.stringContaining("Contingency") });
    expect(await save(await as("helper"), equip.id, [{ lineId: manual.id, plannedCents: 1 }])).toMatchObject({ ok: false, status: 403 });
  });
});
