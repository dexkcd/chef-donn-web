/**
 * "What's due in the next N days?" — v1 acceptance test 3. A line is due when it has a due
 * date and still has money outstanding (forecast − paid).
 */
import type { BudgetRollup, LineRollup } from "./budget";
import { addDays, compareDates, daysBetween, type LocalDate } from "./dates";
import { sumCents, type Cents } from "./money";

export interface DueItem {
  lineId: string;
  categoryId: string;
  description: string;
  dueDate: LocalDate;
  outstanding: Cents;
  /** Negative when overdue. */
  daysFromToday: number;
}

export interface Upcoming {
  overdue: DueItem[];
  due: DueItem[];
  totalOverdue: Cents;
  totalDue: Cents;
  windowEnd: LocalDate;
}

function toItem(r: LineRollup, today: LocalDate): DueItem | null {
  if (!r.line.dueDate || r.outstanding <= 0 || r.line.closed) return null;
  return {
    lineId: r.line.id,
    categoryId: r.line.categoryId,
    description: r.line.description,
    dueDate: r.line.dueDate,
    outstanding: r.outstanding,
    daysFromToday: daysBetween(today, r.line.dueDate),
  };
}

export function upcomingPayments(budget: BudgetRollup, today: LocalDate, days: number): Upcoming {
  const windowEnd = addDays(today, days);
  const items = [...budget.lineById.values()]
    .map((r) => toItem(r, today))
    .filter((i): i is DueItem => i !== null)
    .sort((a, b) => compareDates(a.dueDate, b.dueDate) || b.outstanding - a.outstanding);
  const overdue = items.filter((i) => compareDates(i.dueDate, today) < 0);
  const due = items.filter((i) => compareDates(i.dueDate, today) >= 0 && compareDates(i.dueDate, windowEnd) <= 0);
  return {
    overdue,
    due,
    totalOverdue: sumCents(overdue.map((i) => i.outstanding)),
    totalDue: sumCents(due.map((i) => i.outstanding)),
    windowEnd,
  };
}
