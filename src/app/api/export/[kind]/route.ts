/** CSV for the bookkeeper: every budget line, or every payment. Amounts in pesos ("1234.56"). */
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { budgetCategory, moneyLine, payment } from "@/db/schema";
import { planVsTotal, rollupBudget } from "@/domain/budget";
import { can } from "@/domain/permissions";
import { apiError } from "@/server/api-auth";
import { loadBudgetInputs, loadProfile } from "@/server/services/budget-data";
import { getViewer } from "@/server/viewer";

export const dynamic = "force-dynamic";

const pesos = (c: number | null | undefined) => (c === null || c === undefined ? "" : (c / 100).toFixed(2));

function csv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Quote, and neutralise spreadsheet formulas.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const v = await getViewer();
  if (v.status !== "member") return apiError(401, "Sign in to export.");
  if (!can(v.principal.actor.role, "export.csv")) return apiError(403, "Your role can't export.");
  const ws = v.principal.workspaceId;
  const { kind } = await params;
  const today = new Date().toISOString().slice(0, 10);

  if (kind === "lines") {
    const [inputs, profile] = await Promise.all([loadBudgetInputs(db, ws), loadProfile(db, ws)]);
    const rollup = rollupBudget(inputs.categories, inputs.lineInputs, inputs.paymentInputs);
    const rows: (string | number | null)[][] = [["category", "line", "source", "planned_php", "committed_php", "paid_php", "forecast_php", "over_plan_php", "due_date", "payee", "closed"]];
    for (const c of rollup.categories) {
      for (const l of c.lines) {
        const raw = inputs.lines.find((x) => x.id === l.line.id)!;
        rows.push([c.category.name, l.line.description, l.line.sourceType, pesos(l.planned), pesos(l.committed), pesos(l.paid), pesos(l.forecast), pesos(l.overBy), l.line.dueDate, raw.payeeName, l.line.closed ? "yes" : "no"]);
      }
    }
    // So the planned column adds up to the app's "Planned" (which fills to the total).
    const { unallocated } = planVsTotal(rollup, profile.totalBudgetCents);
    if (unallocated > 0) rows.push(["—", "Not yet allocated (total you can spend − estimates)", "total_budget", pesos(unallocated), pesos(0), pesos(0), pesos(0), pesos(0), null, null, "no"]);
    return new Response(csv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="budget-lines-${today}.csv"` } });
  }

  if (kind === "payments") {
    const rows = await db
      .select({ p: payment, line: moneyLine.description, category: budgetCategory.name })
      .from(payment)
      .innerJoin(moneyLine, eq(moneyLine.id, payment.moneyLineId))
      .innerJoin(budgetCategory, eq(budgetCategory.id, moneyLine.categoryId))
      .where(and(eq(payment.workspaceId, ws)))
      .orderBy(asc(payment.paidOn));
    const out: (string | number | null)[][] = [["paid_on", "amount_php", "method", "payee", "reference_no", "category", "line", "gross_php", "withholding_php", "has_receipt", "voided", "void_reason"]];
    for (const r of rows) {
      out.push([r.p.paidOn, pesos(r.p.amountCents), r.p.method, r.p.payeeName, r.p.referenceNo, r.category, r.line, pesos(r.p.grossCents), pesos(r.p.withholdingCents), r.p.receiptDocumentId ? "yes" : "no", r.p.voidedAt ? "yes" : "no", r.p.voidReason]);
    }
    return new Response(csv(out), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="payments-${today}.csv"` } });
  }

  return apiError(404, "Unknown export.");
}
