import { describe, expect, it } from "vitest";
import { contingencyTarget, planVsTotal, rollupBudget, type CategoryInput, type LineInput, type PaymentInput } from "./budget";
import { cashPosition, runway } from "./cash";
import { upcomingPayments } from "./upcoming";

const cats: CategoryInput[] = [
  { id: "c-site", key: "site", name: "Site", kind: "normal", sort: 1 },
  { id: "c-equip", key: "equipment", name: "Equipment", kind: "normal", sort: 2 },
  { id: "c-cont", key: "contingency", name: "Contingency", kind: "contingency", sort: 90 },
  { id: "c-wc", key: "working_capital", name: "Working-capital reserve", kind: "working_capital", sort: 95 },
];

function line(partial: Partial<LineInput> & Pick<LineInput, "id" | "categoryId">): LineInput {
  return {
    description: partial.id,
    plannedCents: 0,
    committedCents: 0,
    dueDate: null,
    sourceType: "manual",
    locked: false,
    closed: false,
    ...partial,
  };
}

const pay = (moneyLineId: string, amountCents: number, paidOn = "2026-10-01"): PaymentInput => ({
  id: `${moneyLineId}-${amountCents}`,
  moneyLineId,
  amountCents,
  paidOn,
});

describe("planVsTotal", () => {
  const lines = [
    line({ id: "fridge", categoryId: "c-equip", plannedCents: 2_000_000_00 }),
    line({ id: "reserve", categoryId: "c-wc", plannedCents: 722_200_00 }),
    line({ id: "rule", categoryId: "c-cont", plannedCents: 326_664_00, sourceType: "contingency_rule", locked: true }),
  ];
  const r = rollupBudget(cats, lines, []);

  it("fills Planned to the total and shows the rest as not yet allocated", () => {
    expect(planVsTotal(r, 3_500_000_00)).toEqual({
      total: 3_500_000_00,
      estimates: 2_722_200_00,
      contingency: 326_664_00,
      allocated: 3_048_864_00,
      unallocated: 451_136_00,
      over: 0,
      planned: 3_500_000_00,
    });
  });

  it("shows the lines and the overrun when estimates exceed the total", () => {
    expect(planVsTotal(r, 3_000_000_00)).toMatchObject({ planned: 3_048_864_00, over: 48_864_00, unallocated: 0 });
  });

  it("without a total, Planned is what the lines add up to", () => {
    expect(planVsTotal(r, null)).toMatchObject({ planned: 3_048_864_00, over: 0, unallocated: 0, total: null });
  });

  it("a zero total makes every estimate an overrun", () => {
    expect(planVsTotal(r, 0)).toMatchObject({ planned: 3_048_864_00, over: 3_048_864_00, unallocated: 0 });
  });
});

describe("rollupBudget", () => {
  it("separates planned, committed and paid", () => {
    const lines = [
      line({ id: "deposit", categoryId: "c-site", plannedCents: 60_000_00, committedCents: 60_000_00 }),
      line({ id: "fridge", categoryId: "c-equip", plannedCents: 80_000_00 }),
    ];
    const r = rollupBudget(cats, lines, [pay("deposit", 30_000_00)]);
    expect(r.totals).toMatchObject({ planned: 140_000_00, committed: 60_000_00, paid: 30_000_00 });
    expect(r.stillToPay).toBe(110_000_00);
  });

  it("paid above committed lifts committed", () => {
    const lines = [line({ id: "gas", categoryId: "c-equip", plannedCents: 5_000_00, committedCents: 0 })];
    const r = rollupBudget(cats, lines, [pay("gas", 6_000_00)]);
    const l = r.lineById.get("gas")!;
    expect(l.committed).toBe(6_000_00);
    expect(l.overBy).toBe(1_000_00);
  });

  it("draws category overspend from contingency, visibly, naming the category", () => {
    const lines = [
      line({ id: "rule", categoryId: "c-cont", plannedCents: 20_000_00, sourceType: "contingency_rule", locked: true }),
      line({ id: "fridge", categoryId: "c-equip", plannedCents: 50_000_00, committedCents: 62_000_00 }),
      line({ id: "oven", categoryId: "c-equip", plannedCents: 50_000_00 }),
    ];
    const r = rollupBudget(cats, lines, []);
    const equip = r.categories.find((c) => c.category.id === "c-equip")!;
    // The oven isn't bought yet, so it can't offset the fridge overrun.
    expect(equip.forecast).toBe(112_000_00);
    expect(equip.overBy).toBe(12_000_00);
    expect(r.contingency).toMatchObject({ planned: 20_000_00, drawn: 12_000_00, left: 8_000_00, exhausted: false, leftBp: 4000 });
    expect(r.contingency.drawnBy).toEqual([{ categoryId: "c-equip", name: "Equipment", amount: 12_000_00 }]);
  });

  it("only realised savings (closed lines) offset overruns", () => {
    const lines = [
      line({ id: "rule", categoryId: "c-cont", plannedCents: 10_000_00 }),
      line({ id: "fridge", categoryId: "c-equip", plannedCents: 50_000_00, committedCents: 55_000_00 }),
      line({ id: "oven", categoryId: "c-equip", plannedCents: 50_000_00, closed: true }),
    ];
    const r = rollupBudget(cats, lines, [pay("oven", 47_000_00)]);
    const equip = r.categories.find((c) => c.category.id === "c-equip")!;
    expect(equip.overBy).toBe(2_000_00);
    expect(r.contingency.left).toBe(8_000_00);
  });

  it("savings in one category are released back to contingency", () => {
    const lines = [
      line({ id: "rule", categoryId: "c-cont", plannedCents: 10_000_00 }),
      line({ id: "permit", categoryId: "c-site", plannedCents: 10_000_00, closed: true }),
      line({ id: "fridge", categoryId: "c-equip", plannedCents: 50_000_00, committedCents: 53_000_00 }),
    ];
    const r = rollupBudget(cats, lines, [pay("permit", 6_000_00)]);
    expect(r.contingency).toMatchObject({ drawn: 3_000_00, released: 4_000_00, left: 11_000_00 });
  });

  it("an unplanned line counts entirely as overspend", () => {
    const lines = [
      line({ id: "rule", categoryId: "c-cont", plannedCents: 5_000_00 }),
      line({ id: "surprise", categoryId: "c-equip", plannedCents: 0, sourceType: "receipt_unplanned" }),
    ];
    const r = rollupBudget(cats, lines, [pay("surprise", 7_500_00)]);
    expect(r.contingency).toMatchObject({ drawn: 7_500_00, left: -2_500_00, exhausted: true, leftBp: -5000 });
  });

  it("spending booked straight to contingency reduces what's left", () => {
    const lines = [line({ id: "rule", categoryId: "c-cont", plannedCents: 5_000_00 })];
    const r = rollupBudget(cats, lines, [pay("rule", 1_000_00)]);
    expect(r.contingency).toMatchObject({ spentDirect: 1_000_00, left: 4_000_00 });
  });

  it("computes the contingency target from normal categories only", () => {
    const lines = [
      line({ id: "a", categoryId: "c-site", plannedCents: 100_000_00 }),
      line({ id: "b", categoryId: "c-equip", plannedCents: 100_000_00 }),
      line({ id: "wc", categoryId: "c-wc", plannedCents: 999_000_00 }),
      line({ id: "rule", categoryId: "c-cont", plannedCents: 1 }),
    ];
    expect(contingencyTarget(cats, lines, 1200)).toBe(24_000_00);
  });
});

describe("cash and runway", () => {
  const lines = [line({ id: "fit-out", categoryId: "c-site", plannedCents: 300_000_00, committedCents: 300_000_00 })];
  const budget = rollupBudget(cats, lines, [pay("fit-out", 100_000_00)]);
  const sources = [
    { id: "own", type: "owner_equity" as const, name: "Donnrick", committedCents: 250_000_00, expectedOn: null },
    { id: "loan", type: "loan" as const, name: "Family loan", committedCents: 100_000_00, expectedOn: "2026-11-01" },
  ];

  it("cash on hand = received − paid", () => {
    const cash = cashPosition(sources, [{ fundingSourceId: "own", amountCents: 250_000_00, receivedOn: "2026-09-01" }], budget.totals.paid);
    expect(cash).toMatchObject({ received: 250_000_00, expected: 100_000_00, paid: 100_000_00, cashOnHand: 150_000_00 });
  });

  it("is covered only if the loan arrives", () => {
    const cash = cashPosition(sources, [{ fundingSourceId: "own", amountCents: 250_000_00, receivedOn: "2026-09-01" }], budget.totals.paid);
    const r = runway(cash, budget, "2026-10-13", "2027-01-15");
    expect(r).toMatchObject({ daysToOpening: 94, stillToPay: 200_000_00, gapOnCashOnly: -50_000_00, gap: 50_000_00, status: "covered_if_funding_arrives" });
  });

  it("is short when even expected funding won't cover what's left", () => {
    const cash = cashPosition(sources.slice(0, 1), [{ fundingSourceId: "own", amountCents: 150_000_00, receivedOn: "2026-09-01" }], budget.totals.paid);
    expect(runway(cash, budget, "2026-10-13", null)).toMatchObject({ status: "short", daysToOpening: null });
  });
});

describe("upcomingPayments", () => {
  const lines = [
    line({ id: "late", categoryId: "c-site", plannedCents: 10_000_00, dueDate: "2026-10-10" }),
    line({ id: "today", categoryId: "c-site", plannedCents: 5_000_00, dueDate: "2026-10-13" }),
    line({ id: "edge", categoryId: "c-site", plannedCents: 1_000_00, dueDate: "2026-10-27" }),
    line({ id: "beyond", categoryId: "c-site", plannedCents: 1_000_00, dueDate: "2026-10-28" }),
    line({ id: "paid-off", categoryId: "c-site", plannedCents: 2_000_00, dueDate: "2026-10-15" }),
    line({ id: "no-date", categoryId: "c-site", plannedCents: 2_000_00 }),
  ];
  const budget = rollupBudget(cats, lines, [pay("paid-off", 2_000_00), pay("late", 4_000_00)]);

  it("buckets overdue and due-within-window, inclusive of the window end", () => {
    const u = upcomingPayments(budget, "2026-10-13", 14);
    expect(u.overdue.map((i) => i.lineId)).toEqual(["late"]);
    expect(u.overdue[0]).toMatchObject({ outstanding: 6_000_00, daysFromToday: -3 });
    expect(u.due.map((i) => i.lineId)).toEqual(["today", "edge"]);
    expect(u.totalDue).toBe(6_000_00);
    expect(u.windowEnd).toBe("2026-10-27");
  });
});
