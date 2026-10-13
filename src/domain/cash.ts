/**
 * Cash and runway to opening — "how much cash is left, and will it last until we open?"
 */
import type { BudgetRollup } from "./budget";
import { daysBetween, type LocalDate } from "./dates";
import { sumCents, type Cents } from "./money";

export type FundingType = "owner_equity" | "partner_equity" | "loan" | "investor" | "other";

export interface FundingSourceInput {
  id: string;
  type: FundingType;
  name: string;
  committedCents: Cents;
  expectedOn: LocalDate | null;
}

export interface FundingTrancheInput {
  fundingSourceId: string;
  amountCents: Cents;
  receivedOn: LocalDate;
}

export interface CashPosition {
  /** Total funding promised (equity, loans, investors). */
  committed: Cents;
  received: Cents;
  /** Promised but not yet in the bank. */
  expected: Cents;
  paid: Cents;
  cashOnHand: Cents;
  bySource: { source: FundingSourceInput; received: Cents; expected: Cents }[];
}

export function cashPosition(
  sources: readonly FundingSourceInput[],
  tranches: readonly FundingTrancheInput[],
  paid: Cents,
): CashPosition {
  const bySource = sources.map((source) => {
    const received = sumCents(tranches.filter((t) => t.fundingSourceId === source.id).map((t) => t.amountCents));
    return { source, received, expected: Math.max(0, source.committedCents - received) };
  });
  const received = sumCents(bySource.map((s) => s.received));
  const expected = sumCents(bySource.map((s) => s.expected));
  return {
    committed: sumCents(sources.map((s) => s.committedCents)),
    received,
    expected,
    paid,
    cashOnHand: received - paid,
    bySource,
  };
}

export type RunwayStatus = "covered" | "covered_if_funding_arrives" | "short";

export interface Runway {
  daysToOpening: number | null;
  /** Forecast still to pay on normal categories (contingency left is held separately). */
  stillToPay: Cents;
  /** cashOnHand + expected funding − stillToPay. Negative means a funding gap. */
  gap: Cents;
  /** cashOnHand − stillToPay, ignoring funding not yet received. */
  gapOnCashOnly: Cents;
  status: RunwayStatus;
}

export function runway(cash: CashPosition, budget: BudgetRollup, today: LocalDate, openingDate: LocalDate | null): Runway {
  const stillToPay = budget.stillToPay;
  const gapOnCashOnly = cash.cashOnHand - stillToPay;
  const gap = gapOnCashOnly + cash.expected;
  const status: RunwayStatus = gapOnCashOnly >= 0 ? "covered" : gap >= 0 ? "covered_if_funding_arrives" : "short";
  return {
    daysToOpening: openingDate ? daysBetween(today, openingDate) : null,
    stillToPay,
    gap,
    gapOnCashOnly,
    status,
  };
}
