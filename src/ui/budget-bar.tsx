/**
 * One category against its plan: paid (green) and committed-not-yet-paid (gold) fill the
 * planned track; anything past the plan marker is overspend (red), drawn from contingency.
 * Marks ≤ 24px, 2px surface gaps, 4px rounded data ends; values are always in text below,
 * so colour is never the only channel.
 */
import Link from "next/link";
import { formatPeso, type Cents } from "@/domain/money";
import { cx } from "./kit";

export function BudgetBar({
  href,
  name,
  planned,
  committed,
  paid,
  forecast,
  scaleMax,
}: {
  href?: string;
  name: string;
  planned: Cents;
  committed: Cents;
  paid: Cents;
  forecast: Cents;
  /** The largest max(planned, forecast) across the bars, so bars share one scale. */
  scaleMax: Cents;
}) {
  const max = Math.max(scaleMax, 1);
  const pct = (v: Cents) => `${Math.max(0, (v / max) * 100)}%`;
  const over = Math.max(0, forecast - planned);
  const remainingPlan = Math.max(0, planned - committed);
  // Inside the plan: paid then committed-not-paid. Past the plan marker: one red overspend segment.
  const inPlan = Math.min(committed, planned);
  const paidIn = Math.min(paid, inPlan);
  const goldIn = inPlan - paidIn;
  const summary = `${name}: ${formatPeso(paid)} paid, ${formatPeso(committed)} committed, of ${formatPeso(planned)} planned${over > 0 ? `, over by ${formatPeso(over)}` : ""}`;

  const body = (
    <div className="group py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{name}</span>
        {over > 0 ? (
          <span className="label text-[13px] text-red">▲ Over by {formatPeso(over, { noCentavos: true })}</span>
        ) : (
          <span className="num text-[14px] text-muted">{formatPeso(planned, { noCentavos: true })}</span>
        )}
      </div>
      <div className="relative mt-1.5 h-[18px]" aria-hidden>
        {/* planned track */}
        <div className="absolute inset-y-0 left-0 rounded-r-[4px] bg-sunken" style={{ width: pct(planned) }} />
        <div className="absolute inset-y-0 left-0 flex gap-[2px]" style={{ width: pct(inPlan) }}>
          {paidIn > 0 && <div className="h-full rounded-r-[4px] bg-green-bright" style={{ flexGrow: paidIn, flexBasis: 0 }} />}
          {goldIn > 0 && <div className="h-full rounded-r-[4px] bg-gold" style={{ flexGrow: goldIn, flexBasis: 0 }} />}
        </div>
        {over > 0 && <div className="absolute inset-y-0 rounded-r-[4px] bg-red" style={{ left: `calc(${pct(planned)} + 2px)`, width: pct(over) }} />}
        {/* plan marker */}
        {planned > 0 && <div className="absolute -inset-y-1 w-[2px] bg-ink" style={{ left: pct(planned) }} />}
      </div>
      <div className="num mt-1 text-[13px] text-muted">
        {formatPeso(paid, { noCentavos: true })} paid · {formatPeso(committed, { noCentavos: true })} committed
        {remainingPlan > 0 && over === 0 ? ` · ${formatPeso(remainingPlan, { noCentavos: true })} not yet committed` : ""}
      </div>
    </div>
  );

  if (!href) return <div aria-label={summary}>{body}</div>;
  return (
    <Link href={href as never} aria-label={summary} className={cx("block rounded-md px-2 -mx-2 hover:bg-wash focus-visible:bg-wash")}>
      {body}
    </Link>
  );
}

export function BudgetBarLegend() {
  const item = (cls: string, glyph: string, label: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx("inline-block h-3 w-4 rounded-r-[3px]", cls)} aria-hidden />
      <span className="label text-[12px] text-muted">
        {glyph} {label}
      </span>
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {item("bg-green-bright", "✓", "Paid")}
      {item("bg-gold", "●", "Committed")}
      {item("bg-sunken", "○", "Planned")}
      {item("bg-red", "▲", "Over plan")}
    </div>
  );
}
