import type { LineRollup } from "@/domain/budget";
import { StatusBadge } from "./kit";

/** The badges a budget line wears: where its money is, and whether it's an estimate. */
export function LineStatusBadges({ line, estimate, aiEstimate }: { line: LineRollup; estimate?: boolean; aiEstimate?: boolean }) {
  const l = line;
  return (
    <>
      {l.paid > 0 && l.paid >= l.forecast ? (
        <StatusBadge tone="paid" label={l.line.closed ? "Paid · closed" : "Paid"} />
      ) : l.paid > 0 ? (
        <StatusBadge tone="paid" label="Part paid" />
      ) : l.committed > 0 ? (
        <StatusBadge tone="committed" />
      ) : (
        <StatusBadge tone="planned" />
      )}
      {l.overBy > 0 && <StatusBadge tone="over" />}
      {l.line.sourceType === "task" && <StatusBadge tone={estimate ? "estimate" : "planned"} label={estimate ? "Estimate — set yours" : "From roadmap"} />}
      {(l.line.sourceType === "ai_plan" || (l.line.sourceType === "task" && aiEstimate)) && <StatusBadge tone="ai_estimate" label="AI estimate" />}
      {l.line.sourceType === "receipt_unplanned" && <StatusBadge tone="over" label="Unplanned" />}
      {l.line.sourceType === "contingency_rule" && <StatusBadge tone="planned" label="Automatic" />}
    </>
  );
}
