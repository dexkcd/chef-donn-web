import type { Metadata } from "next";
import { db } from "@/db/client";
import { formatDate, manilaToday } from "@/domain/dates";
import { can } from "@/domain/permissions";
import { addTrancheAction, saveFundingAction } from "@/server/actions/budget";
import { budgetOverview } from "@/server/services/budget-data";
import { requireMember } from "@/server/viewer";
import { ActionForm, MoneyField, SelectField, Submit, TextField } from "@/ui/form";
import { Card, EmptyState, KeyValue, Money, PageHeader, SectionTitle } from "@/ui/kit";

export const metadata: Metadata = { title: "Funding" };

const TYPE_LABELS = {
  owner_equity: "Owner's money",
  partner_equity: "Partner's money",
  loan: "Loan",
  investor: "Investor",
  other: "Other",
} as const;

export default async function FundingPage() {
  const v = await requireMember();
  const today = manilaToday(new Date());
  const o = await budgetOverview(db, v.principal.workspaceId, today);
  const canEdit = can(v.principal.actor.role, "funding.edit");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Funding" back={{ href: "/budget", label: "Budget" }} subtitle="Where the money comes from — promised, and actually received." />
      <Card strong>
        <KeyValue
          items={[
            { k: "Promised", v: <Money cents={o.cash.committed} /> },
            { k: "Received", v: <Money cents={o.cash.received} /> },
            { k: "Still expected", v: <Money cents={o.cash.expected} /> },
            { k: "Paid out", v: <Money cents={o.cash.paid} /> },
            { k: "Cash on hand", v: <Money cents={o.cash.cashOnHand} className={`font-semibold ${o.cash.cashOnHand < 0 ? "text-red" : ""}`} /> },
          ]}
        />
      </Card>

      {o.cash.bySource.length === 0 ? (
        <EmptyState title="No funding yet">Add your own money, partners, and any loans.</EmptyState>
      ) : (
        o.cash.bySource.map(({ source, received, expected }) => (
          <Card key={source.id}>
            <SectionTitle action={<span className="label text-[13px] text-muted">{TYPE_LABELS[source.type]}</span>}>{source.name}</SectionTitle>
            <KeyValue
              items={[
                { k: "Promised", v: <Money cents={source.committedCents} /> },
                { k: "Received", v: <Money cents={received} /> },
                { k: "Still expected", v: <Money cents={expected} /> },
                ...(source.expectedOn ? [{ k: "Expected by", v: <span className="num">{formatDate(source.expectedOn)}</span> }] : []),
              ]}
            />
            {canEdit && (
              <details className="mt-3">
                <summary className="label cursor-pointer text-green">＋ Money received</summary>
                <ActionForm action={addTrancheAction} resetOnSuccess className="mt-3">
                  <input type="hidden" name="fundingSourceId" value={source.id} />
                  <MoneyField name="amount" label="Amount received" defaultCents={expected > 0 ? expected : null} />
                  <TextField name="receivedOn" label="Received on" type="date" defaultValue={today} />
                  <TextField name="notes" label="Notes (optional)" />
                  <Submit>Record money received</Submit>
                </ActionForm>
              </details>
            )}
          </Card>
        ))
      )}

      {canEdit && (
        <Card>
          <SectionTitle>Add a funding source</SectionTitle>
          <ActionForm action={saveFundingAction} resetOnSuccess>
            <SelectField name="type" label="Type" defaultValue="owner_equity">
              {Object.entries(TYPE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </SelectField>
            <TextField name="name" label="Name" placeholder="Donnrick's savings" />
            <MoneyField name="committed" label="Amount promised" />
            <TextField name="expectedOn" label="Expected by (optional)" type="date" />
            <Submit>Add funding source</Submit>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
