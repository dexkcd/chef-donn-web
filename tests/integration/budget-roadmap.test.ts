import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { budgetCategory, moneyLine, task } from "@/db/schema";
import { runAction } from "@/server/context";
import {
  createLine,
  createLineInput,
  logPayment,
  logPaymentInput,
  updateLine,
  updateLineInput,
  voidLine,
  lineIdInput,
} from "@/server/services/budget";
import { budgetOverview } from "@/server/services/budget-data";
import { loadRoadmap, onboard, onboardInput, setTaskEstimate, setTaskStatus, taskEstimateInput, taskStatusInput } from "@/server/services/roadmap";
import { expectOk, makeWorkspace } from "./helpers";

async function categoryId(workspaceId: string, key: string) {
  const [c] = await db.select().from(budgetCategory).where(and(eq(budgetCategory.workspaceId, workspaceId), eq(budgetCategory.key, key)));
  return c!.id;
}

describe("onboarding and the roadmap", () => {
  it("creates Port Barton tasks with blocked permits and locked estimate lines", async () => {
    const { ws, ownerPrincipal } = await makeWorkspace();
    const r = expectOk(
      await runAction(ownerPrincipal, "profile.edit", onboardInput, { name: "Kusina", startingPoint: "building", targetOpeningDate: "2027-03-01", contingencyBp: 1000 }, onboard),
    );
    expect(r.tasks).toBeGreaterThan(25);

    const { view, tasks } = await loadRoadmap(db, ws.id, "building");
    expect(view.focusStage).toBe("build");
    const mayors = view.now.find((v) => v.task.key === "svc.build.mayors_permit")!;
    expect(mayors.state.kind).toBe("blocked");

    const lines = await db.select().from(moneyLine).where(eq(moneyLine.workspaceId, ws.id));
    const fitOut = tasks.find((t) => t.templateKey === "ph.build.fit_out")!;
    const fitOutLine = lines.find((l) => l.sourceId === fitOut.id)!;
    expect(fitOutLine).toMatchObject({ locked: true, sourceType: "task", plannedCents: 900_000_00 });

    // Contingency line = 10% of the estimates in normal categories.
    const overview = await budgetOverview(db, ws.id, "2026-10-13");
    const normalPlanned = overview.rollup.categories.filter((c) => c.category.kind === "normal").reduce((a, c) => a + c.planned, 0);
    expect(overview.rollup.contingency.planned).toBe(Math.round(normalPlanned / 10));
  });

  it("editing a task estimate moves its locked line; the line itself refuses direct edits", async () => {
    const { ws, ownerPrincipal } = await makeWorkspace();
    expectOk(await runAction(ownerPrincipal, "profile.edit", onboardInput, { name: "K", startingPoint: "idea" }, onboard));
    const [t] = await db.select().from(task).where(and(eq(task.workspaceId, ws.id), eq(task.templateKey, "ph.build.kitchen_equipment")));
    expectOk(await runAction(ownerPrincipal, "task.edit", taskEstimateInput, { taskId: t!.id, estimateCents: 412_000_00 }, setTaskEstimate));
    const [line] = await db.select().from(moneyLine).where(eq(moneyLine.sourceId, t!.id));
    expect(line!.plannedCents).toBe(412_000_00);

    const direct = await runAction(ownerPrincipal, "line.edit", updateLineInput, { lineId: line!.id, plannedCents: 1 }, updateLine);
    expect(direct).toMatchObject({ ok: false, reason: "This line follows its roadmap task — change the estimate on the task." });
    // Committed amount stays editable on a locked line.
    expectOk(await runAction(ownerPrincipal, "line.edit", updateLineInput, { lineId: line!.id, committedCents: 400_000_00 }, updateLine));

    expectOk(await runAction(ownerPrincipal, "task.set_status", taskStatusInput, { taskId: t!.id, status: "skipped" }, setTaskStatus));
    const [skipped] = await db.select().from(moneyLine).where(eq(moneyLine.sourceId, t!.id));
    expect(skipped!.plannedCents).toBe(0);
  });
});

describe("budget rules over the database", () => {
  it("helpers can't change the budget, and get a reason", async () => {
    const { ws, as } = await makeWorkspace();
    const helper = await as("helper");
    const r = await runAction(helper, "line.create", createLineInput, { categoryId: await categoryId(ws.id, "site"), description: "Rent", plannedCents: 1 }, createLine);
    expect(r).toMatchObject({ ok: false, status: 403, reason: "Helpers can't add budget lines. Ask the owner." });
  });

  it("payments replayed with the same clientId are written once", async () => {
    const { ws, ownerPrincipal } = await makeWorkspace();
    const line = expectOk(
      await runAction(ownerPrincipal, "line.create", createLineInput, { categoryId: await categoryId(ws.id, "site"), description: "Deposit", plannedCents: 60_000_00 }, createLine),
    );
    const input = { clientId: "8b1f8f0e-3c2a-4d8e-9a59-2a4a8c8e0d11", moneyLineId: line.id, amountCents: 30_000_00, paidOn: "2026-10-01", method: "gcash" };
    const a = expectOk(await runAction(ownerPrincipal, "payment.log", logPaymentInput, input, logPayment));
    const b = expectOk(await runAction(ownerPrincipal, "payment.log", logPaymentInput, input, logPayment));
    expect(b.id).toBe(a.id);
    const o = await budgetOverview(db, ws.id, "2026-10-13");
    expect(o.rollup.totals.paid).toBe(30_000_00);
  });

  it("a line with payments can't be voided", async () => {
    const { ws, ownerPrincipal } = await makeWorkspace();
    const line = expectOk(
      await runAction(ownerPrincipal, "line.create", createLineInput, { categoryId: await categoryId(ws.id, "equipment"), description: "Fridge", plannedCents: 50_000_00 }, createLine),
    );
    expectOk(await runAction(ownerPrincipal, "payment.log", logPaymentInput, { moneyLineId: line.id, amountCents: 10_000_00, paidOn: "2026-10-02", method: "cash" }, logPayment));
    const r = await runAction(ownerPrincipal, "line.void", lineIdInput, { lineId: line.id }, voidLine);
    expect(r.ok).toBe(false);
  });
});
