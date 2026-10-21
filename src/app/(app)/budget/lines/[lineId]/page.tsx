import { and, desc, eq } from "drizzle-orm";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { moneyLine, payment, task } from "@/db/schema";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, rollupLine } from "@/domain/budget";
import { formatDate, manilaToday } from "@/domain/dates";
import { can } from "@/domain/permissions";
import { logPaymentAction, setLineClosedAction, updateLineAction, voidLineAction, voidPaymentAction } from "@/server/actions/budget";
import { loadCategories } from "@/server/services/budget-data";
import { requireMember } from "@/server/viewer";
import { ActionForm, MoneyField, SelectField, Submit, TextField } from "@/ui/form";
import { Card, KeyValue, Money, Notice, PageHeader, SectionTitle, StatusBadge } from "@/ui/kit";
import { LineStatusBadges } from "@/ui/line-badges";
import { PriceSearchPanel } from "@/ui/price-search-panel";

export const metadata: Metadata = { title: "Budget line" };

export default async function LinePage({ params }: { params: Promise<{ lineId: string }> }) {
  const { lineId } = await params;
  const v = await requireMember();
  const ws = v.principal.workspaceId;
  const role = v.principal.actor.role;
  const [line] = await db
    .select()
    .from(moneyLine)
    .where(and(eq(moneyLine.id, lineId), eq(moneyLine.workspaceId, ws)));
  if (!line || line.voidedAt) notFound();
  const [payments, cats] = await Promise.all([
    db.select().from(payment).where(eq(payment.moneyLineId, line.id)).orderBy(desc(payment.paidOn), desc(payment.createdAt)),
    loadCategories(db, ws),
  ]);
  const live = payments.filter((p) => !p.voidedAt);
  const r = rollupLine(
    {
      id: line.id,
      categoryId: line.categoryId,
      description: line.description,
      plannedCents: line.plannedCents,
      committedCents: line.committedCents,
      dueDate: line.dueDate,
      sourceType: line.sourceType,
      locked: line.locked,
      closed: line.closedAt !== null,
    },
    live.map((p) => ({ id: p.id, moneyLineId: p.moneyLineId, amountCents: p.amountCents, paidOn: p.paidOn })),
  );
  const cat = cats.find((c) => c.id === line.categoryId);
  const sourceTask = line.sourceType === "task" && line.sourceId ? (await db.select().from(task).where(eq(task.id, line.sourceId)))[0] : undefined;
  const today = manilaToday(new Date());
  const editable = can(role, "line.edit") && line.sourceType !== "contingency_rule";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={line.description}
        back={{ href: `/budget/${line.categoryId}`, label: cat?.name ?? "Budget" }}
        subtitle={
          <span className="flex flex-wrap gap-1.5">
            <LineStatusBadges line={r} estimate={sourceTask?.estimateBasis === "template_mid"} aiEstimate={sourceTask?.estimateBasis === "ai_plan"} />
            {line.closedAt && <StatusBadge tone="done" label="Closed" />}
          </span>
        }
      />

      <Card strong>
        <KeyValue
          items={[
            { k: "○ Planned", v: <Money cents={r.planned} /> },
            { k: "● Committed", v: <Money cents={r.committed} /> },
            { k: "✓ Paid", v: <Money cents={r.paid} /> },
            { k: "Still to pay", v: <Money cents={r.outstanding} className="font-semibold" /> },
            ...(r.overBy > 0 ? [{ k: "▲ Over plan", v: <Money cents={r.overBy} className="font-semibold text-red" /> }] : []),
            ...(line.dueDate ? [{ k: "Due", v: <span className="num">{formatDate(line.dueDate)}</span> }] : []),
            ...(line.payeeName ? [{ k: "Paid to", v: line.payeeName }] : []),
          ]}
        />
      </Card>

      {sourceTask && (
        <Notice tone="info" title="This line follows a roadmap task">
          The planned amount comes from{" "}
          <Link className="font-semibold text-green underline" href={`/roadmap/${sourceTask.id}` as Route}>
            {sourceTask.title}
          </Link>
          . Change the estimate there; committed amount, due date and payee can be edited here.
        </Notice>
      )}

      {can(role, "payment.log") && !line.closedAt && line.sourceType !== "contingency_rule" && (
        <Card>
          <SectionTitle>Log a payment</SectionTitle>
          <ActionForm action={logPaymentAction} resetOnSuccess>
            <input type="hidden" name="moneyLineId" value={line.id} />
            <MoneyField name="amount" label="Amount paid" defaultCents={r.outstanding > 0 ? r.outstanding : null} />
            <TextField name="paidOn" label="Paid on" type="date" defaultValue={today} />
            <SelectField name="method" label="How" defaultValue="cash">
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </SelectField>
            <TextField name="payeeName" label="Paid to" defaultValue={line.payeeName ?? ""} />
            <TextField name="referenceNo" label="OR / reference no. (optional)" />
            {cat?.key === "site" && (
              <details className="rounded-md border-[1.5px] border-line p-3">
                <summary className="label cursor-pointer text-[14px]">Rent with 5% withholding</summary>
                <p className="mt-2 text-[14px] text-muted">Record gross rent and the tax withheld; the amount paid is the net. Your bookkeeper files the 2307 — this only records it.</p>
                <div className="mt-2 flex flex-col gap-3">
                  <MoneyField name="gross" label="Gross rent" />
                  <MoneyField name="withholding" label="Withheld (5%)" />
                </div>
              </details>
            )}
            <Submit>Log payment</Submit>
          </ActionForm>
          <p className="mt-3 text-[14px] text-muted">
            Have a receipt?{" "}
            <Link href="/receipts/capture" className="font-semibold text-green underline">
              Photograph it instead
            </Link>{" "}
            — the AI fills this in for you to confirm.
          </p>
        </Card>
      )}

      <Card>
        <SectionTitle>Payments</SectionTitle>
        {payments.length === 0 ? (
          <p className="text-muted">No payments yet.</p>
        ) : (
          <ul className="divide-y-[1.5px] divide-line">
            {payments.map((p) => (
              <li key={p.id} className="py-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className={p.voidedAt ? "text-muted line-through" : "font-semibold"}>
                      {PAYMENT_METHOD_LABELS[p.method]} · <span className="num">{formatDate(p.paidOn)}</span>
                    </div>
                    <div className="text-[14px] text-muted">
                      {[p.payeeName, p.referenceNo && `Ref ${p.referenceNo}`, p.withholdingCents !== null && `withheld ₱${(p.withholdingCents / 100).toLocaleString("en-US")}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    {p.voidedAt && <div className="text-[14px] text-red">✕ Voided: {p.voidReason}</div>}
                  </div>
                  <Money cents={p.amountCents} className={p.voidedAt ? "text-muted line-through" : "font-semibold"} />
                </div>
                {!p.voidedAt && can(role, "payment.void") && (
                  <details className="mt-1">
                    <summary className="label cursor-pointer text-[13px] text-red">Void this payment</summary>
                    <ActionForm action={voidPaymentAction} className="mt-2">
                      <input type="hidden" name="paymentId" value={p.id} />
                      <TextField name="reason" label="Why" placeholder="Logged twice" />
                      <Submit variant="danger">Void payment</Submit>
                    </ActionForm>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editable && (
        <Card>
          <SectionTitle>Edit line</SectionTitle>
          <ActionForm action={updateLineAction}>
            <input type="hidden" name="lineId" value={line.id} />
            <input type="hidden" name="locked" value={line.locked ? "1" : "0"} />
            {!line.locked && (
              <>
                <SelectField name="categoryId" label="Category" defaultValue={line.categoryId}>
                  {cats
                    .filter((c) => c.kind !== "contingency" && (!c.archivedAt || c.id === line.categoryId))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </SelectField>
                <TextField name="description" label="What is it" defaultValue={line.description} />
                <MoneyField name="planned" label="Planned" defaultCents={line.plannedCents} />
              </>
            )}
            <MoneyField name="committed" label="Committed" defaultCents={line.committedCents} hint="Signed, ordered or agreed — even if not paid yet." />
            <TextField name="dueDate" label="Due date" type="date" defaultValue={line.dueDate ?? ""} />
            <TextField name="payeeName" label="Paid to" defaultValue={line.payeeName ?? ""} />
            <Submit variant="secondary">Save changes</Submit>
          </ActionForm>
        </Card>
      )}

      {line.sourceType === "manual" && can(role, "prices.search") && !line.closedAt && (
        <PriceSearchPanel subject={{ type: "money_line", id: line.id }} defaultQuery={line.description} canApply={can(role, "prices.apply")} />
      )}

      {can(role, "line.close") && line.sourceType !== "contingency_rule" && (
        <Card>
          <SectionTitle>{line.closedAt ? "Reopen" : "Done with this line?"}</SectionTitle>
          <p className="mb-3 text-[15px] text-muted">
            {line.closedAt
              ? "Reopen to add more payments. Its plan goes back to counting in full."
              : "Close it when nothing more will be paid. Anything left unspent goes back to contingency."}
          </p>
          <ActionForm action={setLineClosedAction}>
            <input type="hidden" name="lineId" value={line.id} />
            <input type="hidden" name="closed" value={line.closedAt ? "0" : "1"} />
            <Submit variant="secondary">{line.closedAt ? "Reopen line" : "Close line"}</Submit>
          </ActionForm>
        </Card>
      )}

      {can(role, "line.void") && line.sourceType === "manual" && live.length === 0 && (
        <details className="rounded-lg border-[1.5px] border-line bg-surface p-4">
          <summary className="label cursor-pointer text-red">Remove this line</summary>
          <ActionForm action={voidLineAction} className="mt-3">
            <input type="hidden" name="lineId" value={line.id} />
            <TextField name="reason" label="Why (optional)" placeholder="Added by mistake" />
            <Submit variant="danger">Remove line</Submit>
          </ActionForm>
        </details>
      )}
    </div>
  );
}
