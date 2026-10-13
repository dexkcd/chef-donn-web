/**
 * Calendar dates as ISO strings ("2026-10-13"). The business runs on Manila time, so "today"
 * is computed once at the edge (`manilaToday(now)`) and passed into domain functions.
 */
export type LocalDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isLocalDate(value: string): value is LocalDate {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toUtcMs(date: LocalDate): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return new Date(toUtcMs(date) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86_400_000);
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export const BUSINESS_TIME_ZONE = "Asia/Manila";

/** The calendar date in Manila for a given instant. */
export function manilaToday(now: Date): LocalDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "13 Oct 2026" — unambiguous for both Manila and Stockholm readers. */
export function formatDate(date: LocalDate, opts: { withYear?: boolean } = {}): string {
  const [y, m, d] = date.split("-");
  const month = MONTHS[Number(m) - 1] ?? m;
  return opts.withYear === false ? `${Number(d)} ${month}` : `${Number(d)} ${month} ${y}`;
}
