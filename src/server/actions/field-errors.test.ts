import { describe, expect, it } from "vitest";
import { toInputFieldErrors } from "./field-errors";

describe("toInputFieldErrors", () => {
  it("maps money fields to their input names", () => {
    expect(toInputFieldErrors({ totalBudgetCents: "Enter an amount.", plannedCents: "x", name: "y" })).toEqual({ totalBudget: "Enter an amount.", planned: "x", name: "y" });
  });
  it("applies explicit renames first", () => {
    expect(toInputFieldErrors({ contingencyBp: "Keep it under 50%." }, { contingencyBp: "contingencyPct" })).toEqual({ contingencyPct: "Keep it under 50%." });
  });
  it("passes undefined through and leaves a bare 'Cents' key alone", () => {
    expect(toInputFieldErrors(undefined)).toBeUndefined();
    expect(toInputFieldErrors({ Cents: "z" })).toEqual({ Cents: "z" });
  });
});
